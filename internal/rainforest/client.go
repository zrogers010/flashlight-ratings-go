package rainforest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const baseURL = "https://api.rainforestapi.com/request"

type Client struct {
	apiKey     string
	httpClient *http.Client
	delay      time.Duration
	lastCall   time.Time
}

func NewClient(apiKey string, delay time.Duration) *Client {
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		delay: delay,
	}
}

func (c *Client) throttle() {
	if c.delay <= 0 {
		return
	}
	elapsed := time.Since(c.lastCall)
	if elapsed < c.delay {
		time.Sleep(c.delay - elapsed)
	}
	c.lastCall = time.Now()
}

func (c *Client) get(ctx context.Context, params url.Values) ([]byte, error) {
	c.throttle()

	params.Set("api_key", c.apiKey)
	reqURL := baseURL + "?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("rainforest API status=%d body=%s", resp.StatusCode, truncate(string(body), 500))
	}

	return body, nil
}

// ProductResult holds the fields we care about from a type=product response.
type ProductResult struct {
	ASIN         string
	Title        string
	Brand        string
	Rating       float64
	RatingsTotal int
	MainImage    string
	Price        float64
	Currency     string
	InStock      bool
	SellerName   string
	SoldByAmazon bool
	IsPrime      bool
}

// LookupProduct fetches a single product by ASIN from amazon.com.
func (c *Client) LookupProduct(ctx context.Context, asin string) (*ProductResult, error) {
	params := url.Values{
		"type":          {"product"},
		"amazon_domain": {"amazon.com"},
		"asin":          {asin},
	}

	body, err := c.get(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("lookup %s: %w", asin, err)
	}

	var raw productResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode %s: %w", asin, err)
	}

	if !raw.RequestInfo.Success {
		return nil, fmt.Errorf("lookup %s: API returned success=false", asin)
	}

	p := raw.Product
	result := &ProductResult{
		ASIN:         p.ASIN,
		Title:        p.Title,
		Brand:        p.Brand,
		Rating:       p.Rating,
		RatingsTotal: p.RatingsTotal,
	}

	if p.MainImage.Link != "" {
		result.MainImage = p.MainImage.Link
	}

	bw := p.BuyboxWinner
	if bw.Price.Value > 0 {
		result.Price = bw.Price.Value
		result.Currency = bw.Price.Currency
	}
	result.InStock = bw.Availability.Type == "in_stock"
	result.IsPrime = bw.IsPrime
	result.SoldByAmazon = bw.Fulfillment.IsSoldByAmazon
	result.SellerName = bw.Fulfillment.ThirdPartySeller.Name

	return result, nil
}

// SearchResult holds one result from a type=search response.
type SearchResult struct {
	ASIN         string
	Title        string
	Price        float64
	Rating       float64
	RatingsTotal int
	Image        string
	IsPrime      bool
	IsSponsored  bool
}

// SearchBrand searches Amazon for "[brandName] flashlight" sorted by bestseller rankings.
func (c *Client) SearchBrand(ctx context.Context, brandName string, maxResults int) ([]SearchResult, error) {
	if maxResults <= 0 {
		maxResults = 10
	}

	params := url.Values{
		"type":              {"search"},
		"amazon_domain":     {"amazon.com"},
		"search_term":       {brandName + " flashlight"},
		"sort_by":           {"bestseller_rankings"},
		"exclude_sponsored": {"true"},
	}

	body, err := c.get(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("search %q: %w", brandName, err)
	}

	var raw searchResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode search %q: %w", brandName, err)
	}

	if !raw.RequestInfo.Success {
		return nil, fmt.Errorf("search %q: API returned success=false", brandName)
	}

	results := make([]SearchResult, 0, len(raw.SearchResults))
	for _, sr := range raw.SearchResults {
		if len(results) >= maxResults {
			break
		}
		results = append(results, SearchResult{
			ASIN:         sr.ASIN,
			Title:        sr.Title,
			Price:        sr.Price.Value,
			Rating:       sr.Rating,
			RatingsTotal: sr.RatingsTotal,
			Image:        sr.Image,
			IsPrime:      sr.IsPrime,
			IsSponsored:  sr.IsSponsored,
		})
	}
	return results, nil
}

// --- internal response structs ---

type productResponse struct {
	RequestInfo struct {
		Success bool `json:"success"`
	} `json:"request_info"`
	Product struct {
		ASIN         string  `json:"asin"`
		Title        string  `json:"title"`
		Brand        string  `json:"brand"`
		Rating       float64 `json:"rating"`
		RatingsTotal int     `json:"ratings_total"`
		MainImage    struct {
			Link string `json:"link"`
		} `json:"main_image"`
		BuyboxWinner struct {
			IsPrime      bool `json:"is_prime"`
			Availability struct {
				Type string `json:"type"`
				Raw  string `json:"raw"`
			} `json:"availability"`
			Fulfillment struct {
				IsSoldByAmazon    bool `json:"is_sold_by_amazon"`
				ThirdPartySeller  struct {
					Name string `json:"name"`
				} `json:"third_party_seller"`
			} `json:"fulfillment"`
			Price struct {
				Value    float64 `json:"value"`
				Currency string  `json:"currency"`
			} `json:"price"`
		} `json:"buybox_winner"`
	} `json:"product"`
}

type searchResponse struct {
	RequestInfo struct {
		Success bool `json:"success"`
	} `json:"request_info"`
	SearchResults []struct {
		ASIN         string  `json:"asin"`
		Title        string  `json:"title"`
		Rating       float64 `json:"rating"`
		RatingsTotal int     `json:"ratings_total"`
		Image        string  `json:"image"`
		IsPrime      bool    `json:"is_prime"`
		IsSponsored  bool    `json:"is_sponsored"`
		Price        struct {
			Value    float64 `json:"value"`
			Currency string  `json:"currency"`
			Raw      string  `json:"raw"`
		} `json:"price"`
	} `json:"search_results"`
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
