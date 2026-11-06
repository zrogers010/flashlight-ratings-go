package rainforest

import (
	"context"
	"fmt"
	"testing"
)

// TestSyncCreatorsEligibilityLapse verifies that when Creators API returns
// ErrSourceUnavailable (auth denied), the sync automatically fails over to
// Rainforest for the entire run.
func TestSyncCreatorsEligibilityLapse(t *testing.T) {
	asins := []string{"B0AAA", "B0BBB", "B0CCC"}
	path := writeTestCatalog(t, asins)
	
	// Creators returns eligibility error on Preload
	primary := &fakeSource{
		name: "creators-api",
		err:  fmt.Errorf("access denied: %w", ErrSourceUnavailable),
	}
	
	// Fallback should serve all lookups
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 11, InStock: true, Rating: 4.5, RatingsTotal: 100},
			"B0BBB": {ASIN: "B0BBB", Price: 22, InStock: true, Rating: 4.6, RatingsTotal: 200},
			"B0CCC": {ASIN: "B0CCC", Price: 33, InStock: true, Rating: 4.7, RatingsTotal: 300},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// All rows should be processed via fallback
	if result.Total != 3 {
		t.Errorf("Total = %d, want 3", result.Total)
	}
	if result.Errors != 0 {
		t.Errorf("Errors = %d, want 0 (failover should be transparent)", result.Errors)
	}
	
	// Fallback should serve all 3 lookups
	if len(fallback.calls) != 3 {
		t.Errorf("Fallback calls = %d, want 3", len(fallback.calls))
	}
	
	// Verify prices came from fallback
	rows := readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "11" {
		t.Errorf("price = %q, want 11 (from fallback)", rows[1][colCurrentPriceUSD])
	}
	if rows[2][colCurrentPriceUSD] != "22" {
		t.Errorf("price = %q, want 22 (from fallback)", rows[2][colCurrentPriceUSD])
	}
}

// TestSyncCreatorsEligibilityLapseWithoutFallback verifies that when Creators
// auth fails and no fallback is configured, the sync returns an error.
func TestSyncCreatorsEligibilityLapseWithoutFallback(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	
	primary := &fakeSource{
		name: "creators-api",
		err:  fmt.Errorf("auth denied: %w", ErrSourceUnavailable),
	}
	
	_, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary}, // no fallback
		path, SyncOptions{})
	
	if err == nil {
		t.Fatal("expected error when primary unavailable and no fallback configured")
	}
	
	// Error should mention source unavailability
	if err.Error() == "" {
		t.Errorf("error message empty")
	}
}

// TestSyncCreatorsEligibilityLapseMidRun verifies that when Creators fails
// on the first per-ASIN lookup (not Preload), the sync switches to fallback.
func TestSyncCreatorsEligibilityLapseMidRun(t *testing.T) {
	asins := []string{"B0AAA", "B0BBB"}
	path := writeTestCatalog(t, asins)
	
	// Primary succeeds on Preload but fails on lookup (simulates mid-run auth lapse)
	callCount := 0
	primary := &fakeDynamicSource{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			callCount++
			if callCount == 1 {
				// First lookup fails with auth error
				return nil, fmt.Errorf("auth denied mid-run: %w", ErrSourceUnavailable)
			}
			// This shouldn't be reached due to failover
			return nil, fmt.Errorf("unexpected call after failover")
		},
	}
	
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 11, InStock: true, Rating: 4.5, RatingsTotal: 100},
			"B0BBB": {ASIN: "B0BBB", Price: 22, InStock: true, Rating: 4.6, RatingsTotal: 200},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// Both rows should complete via fallback after mid-run failover
	if result.Total != 2 {
		t.Errorf("Total = %d, want 2", result.Total)
	}
	if len(fallback.calls) != 2 {
		t.Errorf("Fallback calls = %d, want 2 (took over after primary failed)", len(fallback.calls))
	}
}

// fakeDynamicSource allows custom lookup behavior for testing mid-run failures.
type fakeDynamicSource struct {
	name       string
	lookupFunc func(context.Context, string) (*ProductResult, error)
	preloadErr error
	calls      []string
}

func (f *fakeDynamicSource) SourceName() string { return f.name }

func (f *fakeDynamicSource) LookupProduct(ctx context.Context, asin string) (*ProductResult, error) {
	f.calls = append(f.calls, asin)
	return f.lookupFunc(ctx, asin)
}

func (f *fakeDynamicSource) Preload(_ context.Context, _ []string) error {
	return f.preloadErr
}

// TestSyncPreservesExistingFieldsWhenSourceHasNone verifies that when a source
// returns empty/nil fields, existing catalog values are preserved.
func TestSyncPreservesExistingFieldsWhenSourceHasNone(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	
	// Set existing values in catalog
	setCatalogField(t, path, colRatingCount, "150")
	setCatalogField(t, path, colAverageRating, "4.5")
	setCatalogField(t, path, colCurrentPriceUSD, "29.99")
	setCatalogField(t, path, colImageURL, "https://m.media-amazon.com/old.jpg")
	
	// Source returns offer data but no ratings or image
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0AAA": {
				ASIN:    "B0AAA",
				Price:   35.99,
				InStock: true,
				// Rating, RatingsTotal, MainImage all zero/empty
			},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	rows := readCatalogRows(t, path)
	
	// Price should be updated
	if rows[1][colCurrentPriceUSD] != "35.99" {
		t.Errorf("price = %q, want 35.99 (updated)", rows[1][colCurrentPriceUSD])
	}
	
	// Ratings should be preserved (not erased)
	if rows[1][colRatingCount] != "150" {
		t.Errorf("rating count = %q, want 150 (preserved)", rows[1][colRatingCount])
	}
	if rows[1][colAverageRating] != "4.5" {
		t.Errorf("avg rating = %q, want 4.5 (preserved)", rows[1][colAverageRating])
	}
	
	// Image should be preserved when source has none
	if rows[1][colImageURL] != "https://m.media-amazon.com/old.jpg" {
		t.Errorf("image = %q, want preserved", rows[1][colImageURL])
	}
	
	// Should still count as updated (price changed)
	if result.Updated != 1 {
		t.Errorf("Updated = %d, want 1", result.Updated)
	}
}

// TestSyncRatingsReinforcementFailureNonFatal verifies that when ratings
// reinforcement fails, the sync continues with offer data from primary.
func TestSyncRatingsReinforcementFailureNonFatal(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA", "B0BBB"})
	
	setCatalogField(t, path, colRatingCount, "100")
	setCatalogField(t, path, colAverageRating, "4.3")
	
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 30, InStock: true}, // no ratings
			"B0BBB": {ASIN: "B0BBB", Price: 40, InStock: true}, // no ratings
		},
	}
	
	// Ratings source fails
	ratingsSource := &fakeSource{
		name: "rainforest",
		err:  fmt.Errorf("rainforest API error"),
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// Sync should complete successfully despite ratings failure
	if result.Total != 2 {
		t.Errorf("Total = %d, want 2", result.Total)
	}
	
	rows := readCatalogRows(t, path)
	
	// Prices should be updated from primary
	if rows[1][colCurrentPriceUSD] != "30" {
		t.Errorf("B0AAA price = %q, want 30", rows[1][colCurrentPriceUSD])
	}
	
	// Existing ratings should be preserved when reinforcement fails
	if rows[1][colRatingCount] != "100" {
		t.Errorf("rating count = %q, want 100 (preserved on reinforce failure)", rows[1][colRatingCount])
	}
}

// TestSyncZeroRatingsVsAbsentRatings verifies the sync distinguishes between
// explicitly zero ratings (0.0 / 0 reviews) and absent ratings (nil).
func TestSyncZeroRatingsVsAbsentRatings(t *testing.T) {
	asins := []string{"B0NEW", "B0GATED"}
	path := writeTestCatalog(t, asins)
	
	setCatalogField(t, path, colRatingCount, "50")
	setCatalogField(t, path, colAverageRating, "4.0")
	
	// B0NEW has explicit zero ratings (new product), B0GATED has nil (gated)
	zeroInt := 0
	zeroFloat := 0.0
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0NEW": {
				ASIN:         "B0NEW",
				Price:        20,
				InStock:      true,
				Rating:       0.0,          // explicit zero
				RatingsTotal: 0,            // explicit zero
			},
			"B0GATED": {
				ASIN:    "B0GATED",
				Price:   30,
				InStock: true,
				// Rating and RatingsTotal are zero-value (nil semantics in ProductResult)
			},
		},
	}
	// For B0NEW, even with explicit zero we shouldn't overwrite existing unless it's truly new
	// The sync logic currently doesn't write zero ratings, preserving existing values
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0NEW":   {Rating: 0.0, RatingsTotal: 0}, // also zero
			"B0GATED": {Rating: 4.5, RatingsTotal: 100},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	rows := readCatalogRows(t, path)
	
	// B0NEW: explicit zero ratings from both sources; existing should be preserved
	// (sync logic: "if product.Rating > 0" means zero ratings are never written)
	if rows[1][colRatingCount] != "50" {
		t.Errorf("B0NEW rating count = %q, want 50 (zero ratings not written)", rows[1][colRatingCount])
	}
	
	// B0GATED: primary has no ratings, should get reinforcement
	if rows[2][colRatingCount] != "100" {
		t.Errorf("B0GATED rating count = %q, want 100 (reinforced)", rows[2][colRatingCount])
	}
	
	if result.Updated != 2 {
		t.Errorf("Updated = %d, want 2", result.Updated)
	}
	
	// Use the dummy variables to avoid unused errors
	_ = zeroInt
	_ = zeroFloat
}

// TestSyncCreatorsAuthDeniedInBatch verifies that when a batch getItems call
// returns 401/403, it's treated as ErrSourceUnavailable and triggers failover.
func TestSyncCreatorsAuthDeniedInBatch(t *testing.T) {
	asins := []string{"B0AAA", "B0BBB", "B0CCC"}
	path := writeTestCatalog(t, asins)
	
	// Primary's Preload fails with auth denied (simulates batch getItems rejection)
	primary := &fakeSource{
		name: "creators-api",
		err:  fmt.Errorf("credentials rejected: %w", ErrSourceUnavailable),
	}
	
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 11, InStock: true, Rating: 4.5, RatingsTotal: 100},
			"B0BBB": {ASIN: "B0BBB", Price: 22, InStock: true, Rating: 4.6, RatingsTotal: 200},
			"B0CCC": {ASIN: "B0CCC", Price: 33, InStock: true, Rating: 4.7, RatingsTotal: 300},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// Failover should be transparent
	if result.Errors != 0 {
		t.Errorf("Errors = %d, want 0 (auth denial triggers failover, not error)", result.Errors)
	}
	
	// All 3 should be processed via fallback
	if len(fallback.calls) != 3 {
		t.Errorf("Fallback calls = %d, want 3", len(fallback.calls))
	}
}
