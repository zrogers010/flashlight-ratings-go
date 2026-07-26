package rainforest

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// fakeSource is a scripted ProductSource for failover/reinforcement tests.
type fakeSource struct {
	name     string
	results  map[string]*ProductResult
	err      error
	calls    []string
	preloads [][]string
}

func (f *fakeSource) SourceName() string { return f.name }

func (f *fakeSource) LookupProduct(_ context.Context, asin string) (*ProductResult, error) {
	f.calls = append(f.calls, asin)
	if f.err != nil {
		return nil, f.err
	}
	if p, ok := f.results[asin]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("%s: %w", asin, ErrItemNotFound)
}

func (f *fakeSource) Preload(_ context.Context, asins []string) error {
	f.preloads = append(f.preloads, asins)
	return f.err
}

// writeTestCatalog creates a minimal catalog CSV with the real column layout.
func writeTestCatalog(t *testing.T, asins []string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "catalog.csv")

	header := make([]string, colAmazonCheckedAt+1)
	header[colBrandName] = "brand_name"
	header[colASIN] = "asin"
	header[colAmazonURL] = "amazon_url"
	header[colCurrentPriceUSD] = "current_price_usd"
	header[colRatingCount] = "amazon_rating_count"
	header[colAverageRating] = "amazon_average_rating"
	header[colImageURL] = "image_url"
	header[colAmazonPurchasable] = "amazon_purchasable"
	header[colAmazonCheckedAt] = "amazon_availability_checked_at"

	records := [][]string{header}
	for i, asin := range asins {
		row := make([]string, colAmazonCheckedAt+1)
		row[colBrandName] = "TestBrand"
		row[5] = fmt.Sprintf("Model%d", i+1)
		row[colASIN] = asin
		row[colCurrentPriceUSD] = "10.00"
		records = append(records, row)
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	w := csv.NewWriter(f)
	if err := w.WriteAll(records); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return path
}

func readCatalogRows(t *testing.T, path string) [][]string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	records, err := csv.NewReader(f).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	return records
}

func TestSyncPrimaryUpdatesRows(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 25.50, InStock: true, Rating: 4.6, RatingsTotal: 300, MainImage: "https://m.media-amazon.com/images/I/x.jpg"},
		},
	}

	result, err := SyncCSVWithSources(context.Background(), Sources{Primary: primary}, path, SyncOptions{PartnerTag: "tag-20"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Updated != 1 {
		t.Fatalf("Updated = %d, want 1; changes: %v", result.Updated, result.Changes)
	}

	rows := readCatalogRows(t, path)
	if got := rows[1][colCurrentPriceUSD]; got != "25.5" {
		t.Errorf("price = %q, want 25.5", got)
	}
	if got := rows[1][colRatingCount]; got != "300" {
		t.Errorf("rating count = %q, want 300", got)
	}
	if got := rows[1][colImageURL]; got != "https://m.media-amazon.com/images/I/x.jpg" {
		t.Errorf("image = %q", got)
	}
	// Preload should have been called with the selected ASINs.
	if len(primary.preloads) != 1 || primary.preloads[0][0] != "B0AAA" {
		t.Errorf("preloads = %v", primary.preloads)
	}
}

func TestSyncFailsOverWhenPrimaryUnavailable(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA", "B0BBB"})
	primary := &fakeSource{name: "creators-api", err: fmt.Errorf("credentials rejected: %w", ErrSourceUnavailable)}
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 11, InStock: true},
			"B0BBB": {ASIN: "B0BBB", Price: 22, InStock: true},
		},
	}

	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback}, path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Errors != 0 {
		t.Fatalf("Errors = %d, changes: %v", result.Errors, result.Changes)
	}
	if len(fallback.calls) != 2 {
		t.Errorf("fallback served %d lookups, want 2", len(fallback.calls))
	}

	rows := readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "11" || rows[2][colCurrentPriceUSD] != "22" {
		t.Errorf("prices = %q, %q", rows[1][colCurrentPriceUSD], rows[2][colCurrentPriceUSD])
	}
}

func TestSyncNoFallbackPropagatesPreloadError(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	primary := &fakeSource{name: "creators-api", err: fmt.Errorf("rejected: %w", ErrSourceUnavailable)}

	_, err := SyncCSVWithSources(context.Background(), Sources{Primary: primary}, path, SyncOptions{})
	if !errors.Is(err, ErrSourceUnavailable) {
		t.Fatalf("err = %v, want ErrSourceUnavailable", err)
	}
}

func TestSyncRatingsReinforcement(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	// Primary has offer data but no ratings (gated customerReviews).
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 30, InStock: true},
		},
	}
	ratings := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 30, InStock: false, Rating: 4.2, RatingsTotal: 120},
		},
	}

	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratings}, path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}

	rows := readCatalogRows(t, path)
	if got := rows[1][colRatingCount]; got != "120" {
		t.Errorf("reinforced rating count = %q, want 120", got)
	}
	if got := rows[1][colAverageRating]; got != "4.2" {
		t.Errorf("reinforced avg rating = %q, want 4.2", got)
	}
	// Primary said in-stock, ratings source said not: expect a MISMATCH note,
	// and the primary's view should win (offer stays purchasable).
	foundMismatch := false
	for _, c := range result.Changes {
		if len(c) >= 8 && c[:8] == "MISMATCH" {
			foundMismatch = true
		}
	}
	if !foundMismatch {
		t.Errorf("expected MISMATCH in changes, got %v", result.Changes)
	}
	if got := rows[1][colAmazonPurchasable]; got != "true" {
		t.Errorf("purchasable = %q, want true (primary wins)", got)
	}
}

func TestSyncImageTracksListing(t *testing.T) {
	cases := []struct {
		name      string
		oldImage  string
		mainImage string
		want      string
	}{
		{
			name:      "stale amazon image replaced by current one",
			oldImage:  "https://m.media-amazon.com/images/I/old.jpg",
			mainImage: "https://m.media-amazon.com/images/I/new.jpg",
			want:      "https://m.media-amazon.com/images/I/new.jpg",
		},
		{
			name:      "placeholder image never written",
			oldImage:  "https://m.media-amazon.com/images/I/good.jpg",
			mainImage: "https://m.media-amazon.com/images/I/no-img._SCLZZZZZZZ_.jpg",
			want:      "https://m.media-amazon.com/images/I/good.jpg",
		},
		{
			name:      "existing image kept when source has none",
			oldImage:  "https://m.media-amazon.com/images/I/good.jpg",
			mainImage: "",
			want:      "https://m.media-amazon.com/images/I/good.jpg",
		},
		{
			name:      "non-amazon image migrated to amazon CDN",
			oldImage:  "https://cdn.shopify.com/light.jpg",
			mainImage: "https://m.media-amazon.com/images/I/new.jpg",
			want:      "https://m.media-amazon.com/images/I/new.jpg",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := writeTestCatalog(t, []string{"B0AAA"})
			setCatalogField(t, path, colImageURL, tc.oldImage)
			primary := &fakeSource{
				name: "creators-api",
				results: map[string]*ProductResult{
					"B0AAA": {ASIN: "B0AAA", Price: 10, InStock: true, MainImage: tc.mainImage},
				},
			}
			if _, err := SyncCSVWithSources(context.Background(), Sources{Primary: primary}, path, SyncOptions{}); err != nil {
				t.Fatal(err)
			}
			rows := readCatalogRows(t, path)
			if got := rows[1][colImageURL]; got != tc.want {
				t.Errorf("image = %q, want %q", got, tc.want)
			}
		})
	}
}

// setCatalogField rewrites one column of the single data row in a test catalog.
func setCatalogField(t *testing.T, path string, col int, value string) {
	t.Helper()
	records := readCatalogRows(t, path)
	records[1][col] = value
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	w := csv.NewWriter(f)
	if err := w.WriteAll(records); err != nil {
		t.Fatal(err)
	}
	f.Close()
}

func TestSyncItemNotFoundCountsAsUnavailable(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0GONE"})
	primary := &fakeSource{name: "creators-api", results: map[string]*ProductResult{}}

	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary}, path, SyncOptions{AvailabilityThreshold: 1})
	if err != nil {
		t.Fatal(err)
	}
	if result.Unavailable != 1 {
		t.Fatalf("Unavailable = %d, want 1; changes: %v", result.Unavailable, result.Changes)
	}
	if result.Errors != 0 {
		t.Fatalf("Errors = %d, want 0 (not-found is unavailable, not an error)", result.Errors)
	}
	rows := readCatalogRows(t, path)
	if got := rows[1][colAmazonPurchasable]; got != "false" {
		t.Errorf("purchasable = %q, want false after threshold=1 miss", got)
	}
}
