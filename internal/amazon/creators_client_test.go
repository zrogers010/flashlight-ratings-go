package amazon

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"flashlight-ratings-go/internal/rainforest"
)

// newTestServers returns a token server and an API server plus a configured
// client pointed at both.
func newTestClient(t *testing.T, apiHandler http.HandlerFunc) (*CreatorsClient, *atomic.Int64) {
	t.Helper()

	var tokenCalls atomic.Int64
	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenCalls.Add(1)
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("token request body not JSON: %v", err)
		}
		if body["grant_type"] != "client_credentials" || body["scope"] != creatorsScope {
			t.Errorf("unexpected token request body: %v", body)
		}
		json.NewEncoder(w).Encode(map[string]any{
			"access_token": "test-token",
			"token_type":   "bearer",
			"expires_in":   3600,
		})
	}))
	t.Cleanup(tokenSrv.Close)

	apiSrv := httptest.NewServer(apiHandler)
	t.Cleanup(apiSrv.Close)

	client, err := NewCreatorsClient(CreatorsConfig{
		ClientID:     "id",
		ClientSecret: "secret",
		PartnerTag:   "test-20",
		TokenURL:     tokenSrv.URL,
		BaseURL:      apiSrv.URL,
		MinInterval:  time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	return client, &tokenCalls
}

const getItemsFixture = `{
  "itemsResult": {
    "items": [
      {
        "asin": "B0TEST00001",
        "parentASIN": "B0PARENT001",
        "detailPageURL": "https://www.amazon.com/dp/B0TEST00001?tag=test-20",
        "itemInfo": {
          "title": {"displayValue": "ACEBEAM E75 High Output EDC Flashlight, 3000 Lumens"},
          "byLineInfo": {"brand": {"displayValue": "ACEBEAM"}},
          "features": {"displayValues": ["3000 lumens max output", "USB-C rechargeable 21700 battery"]}
        },
        "images": {
          "primary": {
            "large": {"url": "https://m.media-amazon.com/images/I/large.jpg", "height": 500, "width": 500},
            "hiRes": {"url": "https://m.media-amazon.com/images/I/hires.jpg", "height": 1500, "width": 1500}
          },
          "variants": [
            {"large": {"url": "https://m.media-amazon.com/images/I/variant1.jpg"}}
          ]
        },
        "customerReviews": {"count": 205, "starRating": 4.4},
        "offersV2": {
          "listings": [
            {
              "price": {"money": {"amount": 99.99, "currency": "USD"}},
              "availability": {"type": "IN_STOCK"},
              "merchantInfo": {"name": "Acebeam Official"},
              "isBuyBoxWinner": false
            },
            {
              "price": {"money": {"amount": 104.99, "currency": "USD"}},
              "availability": {"type": "IN_STOCK"},
              "merchantInfo": {"name": "Amazon.com"},
              "isBuyBoxWinner": true
            }
          ]
        }
      }
    ]
  }
}`

func TestGetItemsRequestShapeAndMapping(t *testing.T) {
	var gotBody map[string]any
	var gotHeaders http.Header
	client, tokenCalls := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/catalog/v1/getItems" {
			t.Errorf("path = %q, want /catalog/v1/getItems", r.URL.Path)
		}
		gotHeaders = r.Header.Clone()
		json.NewDecoder(r.Body).Decode(&gotBody)
		w.Write([]byte(getItemsFixture))
	})

	products, err := client.LookupItems(context.Background(), []string{"B0TEST00001"})
	if err != nil {
		t.Fatal(err)
	}

	// Request shape: lowerCamelCase keys, bearer token, marketplace header.
	if gotHeaders.Get("Authorization") != "Bearer test-token" {
		t.Errorf("Authorization = %q", gotHeaders.Get("Authorization"))
	}
	if gotHeaders.Get("x-marketplace") != "www.amazon.com" {
		t.Errorf("x-marketplace = %q", gotHeaders.Get("x-marketplace"))
	}
	if _, ok := gotBody["itemIds"]; !ok {
		t.Errorf("body missing itemIds (camelCase): %v", gotBody)
	}
	if gotBody["partnerTag"] != "test-20" {
		t.Errorf("partnerTag = %v", gotBody["partnerTag"])
	}
	if tokenCalls.Load() != 1 {
		t.Errorf("token fetched %d times, want 1", tokenCalls.Load())
	}

	// Response mapping.
	if len(products) != 1 {
		t.Fatalf("got %d products, want 1", len(products))
	}
	p := products[0]
	if p.ASIN != "B0TEST00001" || p.ParentASIN != "B0PARENT001" {
		t.Errorf("ASIN/parent = %q/%q", p.ASIN, p.ParentASIN)
	}
	if p.Brand != "ACEBEAM" {
		t.Errorf("Brand = %q", p.Brand)
	}
	if p.ImageURL != "https://m.media-amazon.com/images/I/hires.jpg" {
		t.Errorf("ImageURL should prefer hiRes, got %q", p.ImageURL)
	}
	if len(p.VariantImages) != 1 {
		t.Errorf("VariantImages = %v", p.VariantImages)
	}
	if p.OfferPrice == nil || *p.OfferPrice != 104.99 {
		t.Errorf("OfferPrice should come from buy-box listing, got %v", p.OfferPrice)
	}
	if p.Seller != "Amazon.com" {
		t.Errorf("Seller = %q", p.Seller)
	}
	if p.Availability != "IN_STOCK" {
		t.Errorf("Availability = %q", p.Availability)
	}
	if p.RatingCount == nil || *p.RatingCount != 205 {
		t.Errorf("RatingCount = %v", p.RatingCount)
	}
	if p.AverageRating == nil || *p.AverageRating != 4.4 {
		t.Errorf("AverageRating = %v", p.AverageRating)
	}
}

func TestGetItemsNullReviewsAndOffers(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"itemsResult":{"items":[{
			"asin":"B0TEST00002",
			"customerReviews": null,
			"offersV2": null,
			"itemInfo": {"title": {"displayValue": "Some Light"}}
		}]}}`))
	})

	products, err := client.LookupItems(context.Background(), []string{"B0TEST00002"})
	if err != nil {
		t.Fatal(err)
	}
	p := products[0]
	if p.RatingCount != nil || p.AverageRating != nil {
		t.Errorf("gated reviews should map to nil, got %v/%v", p.RatingCount, p.AverageRating)
	}
	if p.OfferPrice != nil {
		t.Errorf("null offers should map to nil price, got %v", p.OfferPrice)
	}
}

func TestTokenCachedAcrossCalls(t *testing.T) {
	client, tokenCalls := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"itemsResult":{"items":[]}}`))
	})
	for i := 0; i < 3; i++ {
		if _, err := client.LookupItems(context.Background(), []string{"B0X"}); err != nil {
			t.Fatal(err)
		}
	}
	if tokenCalls.Load() != 1 {
		t.Errorf("token fetched %d times across 3 calls, want 1 (cached)", tokenCalls.Load())
	}
}

func TestAuthDenied(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"errors":[{"code":"AccessDenied","message":"not eligible"}]}`))
	})
	_, err := client.LookupItems(context.Background(), []string{"B0X"})
	if !errors.Is(err, ErrAuthDenied) {
		t.Fatalf("err = %v, want ErrAuthDenied", err)
	}
}

func TestThrottledRequestRetries(t *testing.T) {
	var calls atomic.Int64
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Write([]byte(`{"itemsResult":{"items":[{"asin":"B0X"}]}}`))
	})
	products, err := client.LookupItems(context.Background(), []string{"B0X"})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 {
		t.Fatalf("got %d products after retry, want 1", len(products))
	}
	if calls.Load() != 2 {
		t.Errorf("api called %d times, want 2 (429 then success)", calls.Load())
	}
}

func TestRateLimiterSpacing(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"itemsResult":{"items":[]}}`))
	})
	client.cfg.MinInterval = 50 * time.Millisecond

	start := time.Now()
	for i := 0; i < 3; i++ {
		if _, err := client.LookupItems(context.Background(), []string{"B0X"}); err != nil {
			t.Fatal(err)
		}
	}
	if elapsed := time.Since(start); elapsed < 100*time.Millisecond {
		t.Errorf("3 calls completed in %v, want >= 100ms with 50ms interval", elapsed)
	}
}

func TestSearchItems(t *testing.T) {
	var gotBody map[string]any
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/catalog/v1/searchItems" {
			t.Errorf("path = %q", r.URL.Path)
		}
		json.NewDecoder(r.Body).Decode(&gotBody)
		w.Write([]byte(`{"searchResult":{"totalResultCount":1,"items":[{"asin":"B0SEARCH001","itemInfo":{"title":{"displayValue":"Fenix PD36R"}}}]}}`))
	})

	products, err := client.SearchItems(context.Background(), SearchQuery{
		Keywords: "EDC flashlight", Brand: "Fenix", ItemCount: 10, SortBy: "AvgCustomerReviews",
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotBody["keywords"] != "EDC flashlight" || gotBody["brand"] != "Fenix" {
		t.Errorf("search body = %v", gotBody)
	}
	if len(products) != 1 || products[0].ASIN != "B0SEARCH001" {
		t.Errorf("products = %+v", products)
	}
}

func TestCatalogSourcePreloadAndNotFound(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		// Only one of the two requested ASINs comes back.
		w.Write([]byte(`{"itemsResult":{"items":[{
			"asin":"B0FOUND0001",
			"offersV2":{"listings":[{"price":{"money":{"amount":49.99,"currency":"USD"}},"availability":{"type":"IN_STOCK"},"isBuyBoxWinner":true}]}
		}]}}`))
	})
	src := NewCatalogSource(client)

	if err := src.Preload(context.Background(), []string{"B0FOUND0001", "B0GONE00001"}); err != nil {
		t.Fatal(err)
	}

	p, err := src.LookupProduct(context.Background(), "B0FOUND0001")
	if err != nil {
		t.Fatal(err)
	}
	if p.Price != 49.99 || !p.InStock {
		t.Errorf("mapped result = %+v", p)
	}

	_, err = src.LookupProduct(context.Background(), "B0GONE00001")
	if !errors.Is(err, rainforest.ErrItemNotFound) {
		t.Fatalf("missing preloaded ASIN: err = %v, want ErrItemNotFound", err)
	}
}

func TestCatalogSourceAuthDeniedMapsToSourceUnavailable(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`denied`))
	})
	src := NewCatalogSource(client)
	err := src.Preload(context.Background(), []string{"B0X"})
	if !errors.Is(err, rainforest.ErrSourceUnavailable) {
		t.Fatalf("err = %v, want ErrSourceUnavailable", err)
	}
}
