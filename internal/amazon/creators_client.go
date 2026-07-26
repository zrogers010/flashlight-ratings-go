package amazon

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	defaultTokenURL    = "https://api.amazon.com/auth/o2/token"
	defaultCreatorsURL = "https://creatorsapi.amazon"
	creatorsScope      = "creatorsapi::default"

	// The Creators API caps every operation at ~1 request/second by default.
	defaultMinInterval = time.Second
	// getItems accepts at most 10 ASINs per call.
	getItemsBatchSize = 10
)

// ErrAuthDenied indicates the Creators API rejected our credentials (401/403).
// This is the signal that Associates eligibility lapsed (e.g. the account fell
// below the qualifying-sales threshold) and callers should fail over to the
// backup data source.
var ErrAuthDenied = errors.New("creators api: authentication denied")

// getItemsResources is every resource we can use, kept under the 15-resource
// cap. customerReviews.* is account-gated: most Associates receive null for it
// and the fields are simply absent from responses.
var getItemsResources = []string{
	"images.primary.large",
	"images.primary.highRes",
	"images.variants.large",
	"itemInfo.title",
	"itemInfo.byLineInfo",
	"itemInfo.features",
	"itemInfo.manufactureInfo",
	"itemInfo.productInfo",
	"offersV2.listings.price",
	"offersV2.listings.availability",
	"offersV2.listings.merchantInfo",
	"offersV2.listings.isBuyBoxWinner",
	"customerReviews.count",
	"customerReviews.starRating",
}

type CreatorsConfig struct {
	ClientID     string
	ClientSecret string
	PartnerTag   string
	Marketplace  string // default www.amazon.com
	TokenURL     string // default https://api.amazon.com/auth/o2/token (NA region)
	BaseURL      string // default https://creatorsapi.amazon
	HTTPClient   *http.Client
	MinInterval  time.Duration // min gap between requests; default 1s
	MaxRetries   int           // retries on 429/5xx; default 3
}

// CreatorsClient talks to the Amazon Creators API (the PA-API v5 successor).
// It handles OAuth2 client-credentials token caching, request throttling to
// stay under the 1 TPS limit, and retry with backoff on throttling responses.
type CreatorsClient struct {
	cfg CreatorsConfig

	tokenMu  sync.Mutex
	token    string
	tokenExp time.Time

	throttleMu sync.Mutex
	lastCall   time.Time
}

func NewCreatorsClient(cfg CreatorsConfig) (*CreatorsClient, error) {
	if strings.TrimSpace(cfg.ClientID) == "" {
		return nil, fmt.Errorf("missing creators api client id")
	}
	if strings.TrimSpace(cfg.ClientSecret) == "" {
		return nil, fmt.Errorf("missing creators api client secret")
	}
	if strings.TrimSpace(cfg.PartnerTag) == "" {
		return nil, fmt.Errorf("missing partner tag")
	}
	if cfg.Marketplace == "" {
		cfg.Marketplace = "www.amazon.com"
	}
	if cfg.TokenURL == "" {
		cfg.TokenURL = defaultTokenURL
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultCreatorsURL
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	if cfg.MinInterval <= 0 {
		cfg.MinInterval = defaultMinInterval
	}
	if cfg.MaxRetries <= 0 {
		cfg.MaxRetries = 3
	}
	return &CreatorsClient{cfg: cfg}, nil
}

// LookupItems implements the Client interface used by the DB sync worker.
// ASINs are fetched in batches of 10 (the getItems maximum). ASINs Amazon
// no longer recognizes are simply absent from the result slice.
func (c *CreatorsClient) LookupItems(ctx context.Context, asins []string) ([]Product, error) {
	if len(asins) == 0 {
		return nil, nil
	}
	out := make([]Product, 0, len(asins))
	for i := 0; i < len(asins); i += getItemsBatchSize {
		end := i + getItemsBatchSize
		if end > len(asins) {
			end = len(asins)
		}
		items, err := c.getItems(ctx, asins[i:end])
		if err != nil {
			return nil, err
		}
		out = append(out, items...)
	}
	return out, nil
}

func (c *CreatorsClient) getItems(ctx context.Context, asins []string) ([]Product, error) {
	body := map[string]any{
		"itemIds":     asins,
		"itemIdType":  "ASIN",
		"partnerTag":  c.cfg.PartnerTag,
		"marketplace": c.cfg.Marketplace,
		"resources":   getItemsResources,
	}

	var parsed struct {
		ItemsResult struct {
			Items []creatorsItem `json:"items"`
		} `json:"itemsResult"`
		Errors []creatorsError `json:"errors"`
	}
	if err := c.post(ctx, "/catalog/v1/getItems", body, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.ItemsResult.Items) == 0 && len(parsed.Errors) > 0 {
		return nil, fmt.Errorf("creators getItems: %s: %s", parsed.Errors[0].Code, parsed.Errors[0].Message)
	}

	out := make([]Product, 0, len(parsed.ItemsResult.Items))
	for _, item := range parsed.ItemsResult.Items {
		out = append(out, item.toProduct())
	}
	return out, nil
}

// SearchQuery describes a searchItems call. Zero values are omitted from the
// request payload.
type SearchQuery struct {
	Keywords    string
	Brand       string
	SearchIndex string
	ItemCount   int
	SortBy      string
}

// SearchItems runs a keyword search and maps results into the same Product
// shape as LookupItems.
func (c *CreatorsClient) SearchItems(ctx context.Context, q SearchQuery) ([]Product, error) {
	body := map[string]any{
		"partnerTag":  c.cfg.PartnerTag,
		"marketplace": c.cfg.Marketplace,
		"resources":   getItemsResources,
	}
	if q.Keywords != "" {
		body["keywords"] = q.Keywords
	}
	if q.Brand != "" {
		body["brand"] = q.Brand
	}
	if q.SearchIndex != "" {
		body["searchIndex"] = q.SearchIndex
	}
	if q.ItemCount > 0 {
		body["itemCount"] = q.ItemCount
	}
	if q.SortBy != "" {
		body["sortBy"] = q.SortBy
	}

	var parsed struct {
		SearchResult struct {
			TotalResultCount int            `json:"totalResultCount"`
			Items            []creatorsItem `json:"items"`
		} `json:"searchResult"`
		Errors []creatorsError `json:"errors"`
	}
	if err := c.post(ctx, "/catalog/v1/searchItems", body, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.SearchResult.Items) == 0 && len(parsed.Errors) > 0 {
		// "NoResults" is a normal outcome for narrow brand+category queries.
		if strings.EqualFold(parsed.Errors[0].Code, "NoResults") {
			return nil, nil
		}
		return nil, fmt.Errorf("creators searchItems: %s: %s", parsed.Errors[0].Code, parsed.Errors[0].Message)
	}

	out := make([]Product, 0, len(parsed.SearchResult.Items))
	for _, item := range parsed.SearchResult.Items {
		out = append(out, item.toProduct())
	}
	return out, nil
}

// post throttles, authenticates, sends the request, and retries on 429/5xx
// with exponential backoff.
func (c *CreatorsClient) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	var lastErr error
	for attempt := 0; attempt <= c.cfg.MaxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}

		retryable, err := c.doOnce(ctx, path, payload, out)
		if err == nil {
			return nil
		}
		lastErr = err
		if !retryable {
			return err
		}
	}
	return lastErr
}

func (c *CreatorsClient) doOnce(ctx context.Context, path string, payload []byte, out any) (retryable bool, err error) {
	token, err := c.accessToken(ctx)
	if err != nil {
		return false, err
	}

	c.throttle()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(payload))
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-marketplace", c.cfg.Marketplace)

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return true, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return true, err
	}

	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		// Force a token refresh on the next call in case this was expiry skew
		// rather than lost eligibility; the caller decides whether to fail over.
		c.tokenMu.Lock()
		c.tokenExp = time.Time{}
		c.tokenMu.Unlock()
		return false, fmt.Errorf("%w: status=%d body=%s", ErrAuthDenied, resp.StatusCode, truncate(string(body), 300))
	case resp.StatusCode == http.StatusTooManyRequests:
		return true, fmt.Errorf("creators api throttled (429): %s", truncate(string(body), 300))
	case resp.StatusCode >= 500:
		return true, fmt.Errorf("creators api status=%d body=%s", resp.StatusCode, truncate(string(body), 300))
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return false, fmt.Errorf("creators api status=%d body=%s", resp.StatusCode, truncate(string(body), 500))
	}

	if err := json.Unmarshal(body, out); err != nil {
		return false, fmt.Errorf("decode creators response: %w", err)
	}
	return false, nil
}

func (c *CreatorsClient) throttle() {
	c.throttleMu.Lock()
	defer c.throttleMu.Unlock()
	if elapsed := time.Since(c.lastCall); elapsed < c.cfg.MinInterval {
		time.Sleep(c.cfg.MinInterval - elapsed)
	}
	c.lastCall = time.Now()
}

// accessToken returns a cached OAuth2 token, fetching a fresh one when the
// cached token is within 60s of expiry.
func (c *CreatorsClient) accessToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.token != "" && time.Until(c.tokenExp) > time.Minute {
		return c.token, nil
	}

	reqBody, err := json.Marshal(map[string]string{
		"grant_type":    "client_credentials",
		"client_id":     c.cfg.ClientID,
		"client_secret": c.cfg.ClientSecret,
		"scope":         creatorsScope,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch creators token: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusBadRequest {
		return "", fmt.Errorf("%w: token endpoint status=%d body=%s", ErrAuthDenied, resp.StatusCode, truncate(string(body), 300))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("creators token status=%d body=%s", resp.StatusCode, truncate(string(body), 300))
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if parsed.AccessToken == "" {
		return "", errors.New("creators token response missing access_token")
	}

	c.token = parsed.AccessToken
	if parsed.ExpiresIn <= 0 {
		parsed.ExpiresIn = 3600
	}
	c.tokenExp = time.Now().Add(time.Duration(parsed.ExpiresIn) * time.Second)
	return c.token, nil
}

// --- response mapping ---

type creatorsError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type creatorsImageSize struct {
	URL    string `json:"url"`
	Height int    `json:"height"`
	Width  int    `json:"width"`
}

type creatorsImageType struct {
	Small  creatorsImageSize `json:"small"`
	Medium creatorsImageSize `json:"medium"`
	Large  creatorsImageSize `json:"large"`
	HiRes  creatorsImageSize `json:"hiRes"`
}

func (t creatorsImageType) best() string {
	switch {
	case t.HiRes.URL != "":
		return t.HiRes.URL
	case t.Large.URL != "":
		return t.Large.URL
	case t.Medium.URL != "":
		return t.Medium.URL
	default:
		return t.Small.URL
	}
}

type creatorsMoney struct {
	Amount   *float64 `json:"amount"`
	Currency string   `json:"currency"`
}

type creatorsItem struct {
	ASIN          string `json:"asin"`
	ParentASIN    string `json:"parentASIN"`
	DetailPageURL string `json:"detailPageURL"`
	ItemInfo      struct {
		Title struct {
			DisplayValue string `json:"displayValue"`
		} `json:"title"`
		ByLineInfo struct {
			Brand struct {
				DisplayValue string `json:"displayValue"`
			} `json:"brand"`
			Manufacturer struct {
				DisplayValue string `json:"displayValue"`
			} `json:"manufacturer"`
		} `json:"byLineInfo"`
		Features struct {
			DisplayValues []string `json:"displayValues"`
		} `json:"features"`
		ManufactureInfo struct {
			Model struct {
				DisplayValue string `json:"displayValue"`
			} `json:"model"`
		} `json:"manufactureInfo"`
	} `json:"itemInfo"`
	Images struct {
		Primary  creatorsImageType   `json:"primary"`
		Variants []creatorsImageType `json:"variants"`
	} `json:"images"`
	CustomerReviews struct {
		Count      *int     `json:"count"`
		StarRating *float64 `json:"starRating"`
	} `json:"customerReviews"`
	OffersV2 struct {
		Listings []struct {
			Price struct {
				Money creatorsMoney `json:"money"`
			} `json:"price"`
			Availability struct {
				Type    string `json:"type"`
				Message string `json:"message"`
			} `json:"availability"`
			MerchantInfo struct {
				Name string `json:"name"`
			} `json:"merchantInfo"`
			IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
		} `json:"listings"`
	} `json:"offersV2"`
}

func (item creatorsItem) toProduct() Product {
	p := Product{
		ASIN:          item.ASIN,
		ParentASIN:    item.ParentASIN,
		CurrencyCode:  "USD",
		Title:         item.ItemInfo.Title.DisplayValue,
		Brand:         item.ItemInfo.ByLineInfo.Brand.DisplayValue,
		Manufacturer:  item.ItemInfo.ByLineInfo.Manufacturer.DisplayValue,
		ModelNumber:   item.ItemInfo.ManufactureInfo.Model.DisplayValue,
		DetailPageURL: item.DetailPageURL,
		Features:      item.ItemInfo.Features.DisplayValues,
		ImageURL:      item.Images.Primary.best(),
	}
	for _, v := range item.Images.Variants {
		if u := v.best(); u != "" {
			p.VariantImages = append(p.VariantImages, u)
		}
	}
	if item.CustomerReviews.Count != nil {
		v := *item.CustomerReviews.Count
		p.RatingCount = &v
	}
	if item.CustomerReviews.StarRating != nil {
		v := *item.CustomerReviews.StarRating
		p.AverageRating = &v
	}

	// Prefer the buy-box listing; fall back to the first listing.
	listings := item.OffersV2.Listings
	idx := -1
	for i, l := range listings {
		if l.IsBuyBoxWinner {
			idx = i
			break
		}
	}
	if idx == -1 && len(listings) > 0 {
		idx = 0
	}
	if idx >= 0 {
		l := listings[idx]
		if l.Price.Money.Amount != nil && *l.Price.Money.Amount > 0 {
			v := *l.Price.Money.Amount
			p.OfferPrice = &v
			if l.Price.Money.Currency != "" {
				p.CurrencyCode = l.Price.Money.Currency
			}
		}
		p.Seller = l.MerchantInfo.Name
		p.Availability = l.Availability.Type
	}

	raw, _ := json.Marshal(item)
	p.RawPayload = raw
	return p
}
