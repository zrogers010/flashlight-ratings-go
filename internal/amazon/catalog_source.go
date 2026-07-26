package amazon

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"flashlight-ratings-go/internal/rainforest"
)

// CatalogSource adapts the Creators API client to the CSV catalog sync's
// ProductSource interface, batching lookups 10 ASINs at a time via Preload.
type CatalogSource struct {
	client *CreatorsClient

	mu        sync.Mutex
	cache     map[string]*rainforest.ProductResult
	preloaded map[string]bool
}

func NewCatalogSource(client *CreatorsClient) *CatalogSource {
	return &CatalogSource{
		client:    client,
		cache:     map[string]*rainforest.ProductResult{},
		preloaded: map[string]bool{},
	}
}

func (s *CatalogSource) SourceName() string { return "creators-api" }

// Preload fetches all ASINs in getItems batches and caches the results.
// Credential rejection is surfaced as ErrSourceUnavailable so the sync fails
// over to Rainforest.
func (s *CatalogSource) Preload(ctx context.Context, asins []string) error {
	products, err := s.client.LookupItems(ctx, asins)
	if err != nil {
		return wrapSourceErr(err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range products {
		s.cache[products[i].ASIN] = toProductResult(products[i])
	}
	for _, asin := range asins {
		s.preloaded[asin] = true
	}
	return nil
}

func (s *CatalogSource) LookupProduct(ctx context.Context, asin string) (*rainforest.ProductResult, error) {
	s.mu.Lock()
	if p, ok := s.cache[asin]; ok {
		s.mu.Unlock()
		return p, nil
	}
	// A preload covered this ASIN but Amazon didn't return it: the listing
	// is gone or inaccessible.
	if s.preloaded[asin] {
		s.mu.Unlock()
		return nil, fmt.Errorf("%s: %w", asin, rainforest.ErrItemNotFound)
	}
	s.mu.Unlock()

	products, err := s.client.LookupItems(ctx, []string{asin})
	if err != nil {
		return nil, wrapSourceErr(err)
	}
	if len(products) == 0 {
		return nil, fmt.Errorf("%s: %w", asin, rainforest.ErrItemNotFound)
	}
	result := toProductResult(products[0])
	s.mu.Lock()
	s.cache[asin] = result
	s.mu.Unlock()
	return result, nil
}

func wrapSourceErr(err error) error {
	if errors.Is(err, ErrAuthDenied) {
		return fmt.Errorf("%w: %v", rainforest.ErrSourceUnavailable, err)
	}
	return err
}

func toProductResult(p Product) *rainforest.ProductResult {
	r := &rainforest.ProductResult{
		ASIN:         p.ASIN,
		Title:        p.Title,
		Brand:        p.Brand,
		MainImage:    p.ImageURL,
		Currency:     p.CurrencyCode,
		SellerName:   p.Seller,
		SoldByAmazon: p.Seller == "Amazon.com",
		IsPrime:      p.IsPrime,
		InStock:      AvailabilityInStock(p.Availability),
	}
	if p.OfferPrice != nil {
		r.Price = *p.OfferPrice
	}
	if p.RatingCount != nil {
		r.RatingsTotal = *p.RatingCount
	}
	if p.AverageRating != nil {
		r.Rating = *p.AverageRating
	}
	return r
}
