package rainforest

import (
	"context"
	"errors"
)

// ProductSource is a per-ASIN product data source feeding the CSV catalog
// sync. Implementations: *Client (Rainforest) and the Creators API adapter
// in internal/amazon.
type ProductSource interface {
	SourceName() string
	LookupProduct(ctx context.Context, asin string) (*ProductResult, error)
}

// BatchPreloader is optionally implemented by sources that can warm a batch
// of ASINs in fewer upstream requests (the Creators API fetches 10 ASINs per
// call). The sync calls Preload with every ASIN it is about to process.
type BatchPreloader interface {
	Preload(ctx context.Context, asins []string) error
}

// ErrSourceUnavailable signals the source cannot serve any requests (bad or
// lapsed credentials, unconfigured). The sync fails over to the fallback
// source for the remainder of the run.
var ErrSourceUnavailable = errors.New("product source unavailable")

// ErrItemNotFound signals the source responded but did not recognize the
// ASIN — treated as evidence the listing is gone (feeds the unavailable
// streak, protected by the soft-disable grace period).
var ErrItemNotFound = errors.New("item not returned by source")

// SourceName implements ProductSource for the Rainforest client.
func (c *Client) SourceName() string { return "rainforest" }

// Sources bundles the data sources for a sync run.
type Sources struct {
	// Primary serves price/availability/image data. Required.
	Primary ProductSource
	// Fallback takes over completely when Primary reports
	// ErrSourceUnavailable. Optional.
	Fallback ProductSource
	// RatingsFrom reinforces rating fields when the Primary result carries
	// none (the Creators API gates customerReviews for most accounts).
	// Optional; ignored while running on the Fallback source.
	RatingsFrom ProductSource
}
