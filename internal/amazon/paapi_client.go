package amazon

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	paapiService = "ProductAdvertisingAPI"
	paapiTarget  = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems"
	paapiPath    = "/paapi5/getitems"
)

type PAAPIConfig struct {
	AccessKeyID     string
	SecretAccessKey string
	PartnerTag      string
	RegionCode      string
	PartnerType     string
	Marketplace     string
	HTTPClient      *http.Client
}

type PAAPIClient struct {
	accessKeyID     string
	secretAccessKey string
	partnerTag      string
	partnerType     string
	regionCode      string
	signingRegion   string
	marketplace     string
	host            string
	httpClient      *http.Client
}

func NewPAAPIClient(cfg PAAPIConfig) (*PAAPIClient, error) {
	if strings.TrimSpace(cfg.AccessKeyID) == "" {
		return nil, fmt.Errorf("missing access key id")
	}
	if strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, fmt.Errorf("missing secret access key")
	}
	if strings.TrimSpace(cfg.PartnerTag) == "" {
		return nil, fmt.Errorf("missing partner tag")
	}

	regionCode := strings.ToUpper(strings.TrimSpace(cfg.RegionCode))
	if regionCode == "" {
		regionCode = "US"
	}
	host, signingRegion, marketplace, err := resolvePAAPIRegion(regionCode)
	if err != nil {
		return nil, err
	}

	partnerType := strings.TrimSpace(cfg.PartnerType)
	if partnerType == "" {
		partnerType = "Associates"
	}

	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}

	if strings.TrimSpace(cfg.Marketplace) != "" {
		marketplace = strings.TrimSpace(cfg.Marketplace)
	}

	return &PAAPIClient{
		accessKeyID:     cfg.AccessKeyID,
		secretAccessKey: cfg.SecretAccessKey,
		partnerTag:      cfg.PartnerTag,
		partnerType:     partnerType,
		regionCode:      regionCode,
		signingRegion:   signingRegion,
		marketplace:     marketplace,
		host:            host,
		httpClient:      hc,
	}, nil
}

func resolvePAAPIRegion(code string) (host, signingRegion, marketplace string, err error) {
	switch code {
	case "US":
		return "webservices.amazon.com", "us-east-1", "www.amazon.com", nil
	case "CA":
		return "webservices.amazon.ca", "us-east-1", "www.amazon.ca", nil
	case "UK":
		return "webservices.amazon.co.uk", "eu-west-1", "www.amazon.co.uk", nil
	case "DE":
		return "webservices.amazon.de", "eu-west-1", "www.amazon.de", nil
	case "FR":
		return "webservices.amazon.fr", "eu-west-1", "www.amazon.fr", nil
	case "IT":
		return "webservices.amazon.it", "eu-west-1", "www.amazon.it", nil
	case "ES":
		return "webservices.amazon.es", "eu-west-1", "www.amazon.es", nil
	case "JP":
		return "webservices.amazon.co.jp", "us-west-2", "www.amazon.co.jp", nil
	case "IN":
		return "webservices.amazon.in", "eu-west-1", "www.amazon.in", nil
	default:
		return "", "", "", fmt.Errorf("unsupported AMAZON_REGION %q", code)
	}
}

func (c *PAAPIClient) LookupItems(ctx context.Context, asins []string) ([]Product, error) {
	if len(asins) == 0 {
		return nil, nil
	}

	reqBody := map[string]any{
		"ItemIds":     asins,
		"ItemIdType":  "ASIN",
		"PartnerTag":  c.partnerTag,
		"PartnerType": c.partnerType,
		"Marketplace": c.marketplace,
		"Resources": []string{
			"ItemInfo.Title",
			"CustomerReviews.Count",
			"CustomerReviews.StarRating",
			"Offers.Listings.Price",
			"Images.Primary.Large",
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	payloadHash := sha256Hex(payload)

	canonicalHeaders := strings.Join([]string{
		"content-encoding:amz-1.0",
		"content-type:application/json; charset=utf-8",
		"host:" + c.host,
		"x-amz-date:" + amzDate,
		"x-amz-target:" + paapiTarget,
		"",
	}, "\n")
	signedHeaders := "content-encoding;content-type;host;x-amz-date;x-amz-target"
	canonicalRequest := strings.Join([]string{
		"POST",
		paapiPath,
		"",
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, c.signingRegion, paapiService)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := deriveSigningKey(c.secretAccessKey, dateStamp, c.signingRegion, paapiService)
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))
	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.accessKeyID,
		credentialScope,
		signedHeaders,
		signature,
	)

	url := "https://" + c.host + paapiPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json; charset=utf-8")
	req.Header.Set("content-encoding", "amz-1.0")
	req.Header.Set("host", c.host)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-target", paapiTarget)
	req.Header.Set("authorization", authHeader)

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
		return nil, fmt.Errorf("paapi getitems failed status=%d body=%s", resp.StatusCode, truncate(string(body), 800))
	}

	var parsed paapiGetItemsResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode paapi response: %w", err)
	}

	if len(parsed.Errors) > 0 {
		return nil, fmt.Errorf("paapi errors: %s", parsed.Errors[0].Message)
	}

	out := make([]Product, 0, len(parsed.ItemsResult.Items))
	for _, item := range parsed.ItemsResult.Items {
		p := Product{
			ASIN:         item.ASIN,
			CurrencyCode: "USD",
		}
		if item.CustomerReviews.Count != nil {
			v := *item.CustomerReviews.Count
			p.RatingCount = &v
		}
		if item.CustomerReviews.StarRating != nil {
			v := *item.CustomerReviews.StarRating
			p.AverageRating = &v
		}
		if len(item.Offers.Listings) > 0 && item.Offers.Listings[0].Price.Amount != nil {
			v := *item.Offers.Listings[0].Price.Amount
			p.OfferPrice = &v
			if item.Offers.Listings[0].Price.Currency != "" {
				p.CurrencyCode = item.Offers.Listings[0].Price.Currency
			}
		}
		raw, _ := json.Marshal(item)
		p.RawPayload = raw
		out = append(out, p)
	}
	return out, nil
}

func sha256Hex(input []byte) string {
	sum := sha256.Sum256(input)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(data))
	return h.Sum(nil)
}

func deriveSigningKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}

type paapiGetItemsResponse struct {
	ItemsResult struct {
		Items []paapiItem `json:"Items"`
	} `json:"ItemsResult"`
	Errors []struct {
		Code    string `json:"Code"`
		Message string `json:"Message"`
	} `json:"Errors"`
}

type paapiItem struct {
	ASIN            string `json:"ASIN"`
	CustomerReviews struct {
		Count      *int     `json:"Count"`
		StarRating *float64 `json:"StarRating"`
	} `json:"CustomerReviews"`
	Offers struct {
		Listings []struct {
			Price struct {
				Amount   *float64 `json:"Amount"`
				Currency string   `json:"Currency"`
			} `json:"Price"`
		} `json:"Listings"`
	} `json:"Offers"`
}
