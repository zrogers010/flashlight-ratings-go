package rainforest

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// fakeSourceWithCounter wraps a fakeSource and counts calls.
type fakeSourceWithCounter struct {
	inner   *fakeSource
	counter *int
}

func (f *fakeSourceWithCounter) SourceName() string {
	return f.inner.SourceName()
}

func (f *fakeSourceWithCounter) LookupProduct(ctx context.Context, asin string) (*ProductResult, error) {
	*f.counter++
	return f.inner.LookupProduct(ctx, asin)
}

// fakeDynamicSourceWithPreload extends fakeDynamicSource with custom Preload.
type fakeDynamicSourceWithPreload struct {
	name        string
	lookupFunc  func(context.Context, string) (*ProductResult, error)
	preloadFunc func(context.Context, []string) error
	calls       []string
}

func (f *fakeDynamicSourceWithPreload) SourceName() string { return f.name }

func (f *fakeDynamicSourceWithPreload) LookupProduct(ctx context.Context, asin string) (*ProductResult, error) {
	f.calls = append(f.calls, asin)
	return f.lookupFunc(ctx, asin)
}

func (f *fakeDynamicSourceWithPreload) Preload(ctx context.Context, asins []string) error {
	return f.preloadFunc(ctx, asins)
}

// TestTransientEligibilityLossAndRecovery verifies that when Creators API
// eligibility is lost (auth denial) and then recovered, the sync automatically
// uses Creators again without manual intervention.
func TestTransientEligibilityLossAndRecovery(t *testing.T) {
	asins := []string{"B0AAA", "B0BBB"}
	path := writeTestCatalog(t, asins)
	
	// Simulate eligibility status that changes between runs
	eligible := false // Start ineligible
	
	primaryCallCount := 0
	primary := &fakeDynamicSource{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			primaryCallCount++
			if !eligible {
				return nil, fmt.Errorf("not eligible: %w", ErrSourceUnavailable)
			}
			// When eligible, return data
			return &ProductResult{ASIN: asin, Price: 100, InStock: true, Rating: 4.5, RatingsTotal: 100}, nil
		},
	}
	primary.preloadErr = nil // Start with successful preload (check individual lookups)
	
	fallbackCallCount := 0
	fallback := &fakeSourceWithCounter{
		inner: &fakeSource{
			name: "rainforest",
			results: map[string]*ProductResult{
				"B0AAA": {ASIN: "B0AAA", Price: 50, InStock: true, Rating: 4.3, RatingsTotal: 50},
				"B0BBB": {ASIN: "B0BBB", Price: 60, InStock: true, Rating: 4.4, RatingsTotal: 60},
			},
		},
		counter: &fallbackCallCount,
	}
	
	// RUN 1: Eligibility lapsed - should use fallback
	result1, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if result1.Total != 2 {
		t.Errorf("run 1: total = %d, want 2", result1.Total)
	}
	if fallbackCallCount != 2 {
		t.Errorf("run 1: fallback calls = %d, want 2 (used fallback)", fallbackCallCount)
	}
	
	rows := readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "50" {
		t.Errorf("run 1: B0AAA price = %q, want 50 (from fallback)", rows[1][colCurrentPriceUSD])
	}
	
	// RUN 2: Eligibility restored - should try Creators again and succeed
	eligible = true
	primaryCallCount = 0
	fallbackCallCount = 0
	
	result2, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if result2.Total != 2 {
		t.Errorf("run 2: total = %d, want 2", result2.Total)
	}
	if primaryCallCount != 2 {
		t.Errorf("run 2: primary calls = %d, want 2 (used primary)", primaryCallCount)
	}
	if fallbackCallCount != 0 {
		t.Errorf("run 2: fallback calls = %d, want 0 (primary succeeded)", fallbackCallCount)
	}
	
	rows = readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "100" {
		t.Errorf("run 2: B0AAA price = %q, want 100 (from primary)", rows[1][colCurrentPriceUSD])
	}
	
	// RUN 3: Eligibility lost again - should fail over again
	eligible = false
	primaryCallCount = 0
	fallbackCallCount = 0
	
	_, err = SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if fallbackCallCount != 2 {
		t.Errorf("run 3: fallback calls = %d, want 2 (failed over again)", fallbackCallCount)
	}
	
	rows = readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "50" {
		t.Errorf("run 3: B0AAA price = %q, want 50 (from fallback again)", rows[1][colCurrentPriceUSD])
	}
}

// TestTransientEligibilityPreloadFailure verifies that when eligibility is lost
// at the preload stage (batch getItems), the failover works and recovery happens
// on the next run.
func TestTransientEligibilityPreloadFailure(t *testing.T) {
	asins := []string{"B0AAA", "B0BBB", "B0CCC"}
	path := writeTestCatalog(t, asins)
	
	eligible := false // Start ineligible
	
	preloadCallCount := 0
	primary := &fakeDynamicSourceWithPreload{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			if !eligible {
				return nil, fmt.Errorf("not eligible: %w", ErrSourceUnavailable)
			}
			return &ProductResult{ASIN: asin, Price: 200, InStock: true, Rating: 4.8, RatingsTotal: 200}, nil
		},
		preloadFunc: func(ctx context.Context, asins []string) error {
			preloadCallCount++
			if !eligible {
				return fmt.Errorf("batch request denied: %w", ErrSourceUnavailable)
			}
			return nil
		},
	}
	
	fallbackCallCount := 0
	fallback := &fakeSourceWithCounter{
		inner: &fakeSource{
			name: "rainforest",
			results: map[string]*ProductResult{
				"B0AAA": {ASIN: "B0AAA", Price: 30, InStock: true, Rating: 4.2, RatingsTotal: 30},
				"B0BBB": {ASIN: "B0BBB", Price: 40, InStock: true, Rating: 4.3, RatingsTotal: 40},
				"B0CCC": {ASIN: "B0CCC", Price: 50, InStock: true, Rating: 4.4, RatingsTotal: 50},
			},
		},
		counter: &fallbackCallCount,
	}
	
	// RUN 1: Preload fails - should immediately fail over without trying individual lookups
	_, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if preloadCallCount != 1 {
		t.Errorf("run 1: preload calls = %d, want 1", preloadCallCount)
	}
	if fallbackCallCount != 3 {
		t.Errorf("run 1: fallback calls = %d, want 3 (all via fallback)", fallbackCallCount)
	}
	
	// RUN 2: Eligibility restored - should try preload again
	eligible = true
	preloadCallCount = 0
	fallbackCallCount = 0
	
	_, err = SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if preloadCallCount != 1 {
		t.Errorf("run 2: preload calls = %d, want 1 (tried again)", preloadCallCount)
	}
	if fallbackCallCount != 0 {
		t.Errorf("run 2: fallback calls = %d, want 0 (primary succeeded)", fallbackCallCount)
	}
	
	rows := readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "200" {
		t.Errorf("run 2: B0AAA price = %q, want 200 (from primary)", rows[1][colCurrentPriceUSD])
	}
}

// TestDataPreservedDuringEligibilityFluctuation verifies that existing ratings
// and other fields are preserved when eligibility flips.
func TestDataPreservedDuringEligibilityFluctuation(t *testing.T) {
	asins := []string{"B0AAA"}
	path := writeTestCatalog(t, asins)
	
	// Set initial state with good data
	setCatalogField(t, path, colCurrentPriceUSD, "100.00")
	setCatalogField(t, path, colRatingCount, "500")
	setCatalogField(t, path, colAverageRating, "4.7")
	setCatalogField(t, path, colImageURL, "https://m.media-amazon.com/original.jpg")
	
	eligible := false // Start ineligible
	
	primary := &fakeDynamicSource{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			if !eligible {
				return nil, fmt.Errorf("not eligible: %w", ErrSourceUnavailable)
			}
			// When eligible, return offer but no ratings (gated)
			return &ProductResult{
				ASIN:      asin,
				Price:     110,
				InStock:   true,
				MainImage: "https://m.media-amazon.com/new.jpg",
				// No ratings provided
			}, nil
		},
	}
	
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {
				ASIN:    "B0AAA",
				Price:   105,
				InStock: true,
				// Also no ratings in fallback
			},
		},
	}
	
	// RUN 1: Ineligible - use fallback, price updates but ratings preserved
	_, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	rows := readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "105" {
		t.Errorf("run 1: price = %q, want 105 (updated)", rows[1][colCurrentPriceUSD])
	}
	if rows[1][colRatingCount] != "500" {
		t.Errorf("run 1: rating count = %q, want 500 (preserved)", rows[1][colRatingCount])
	}
	if rows[1][colAverageRating] != "4.7" {
		t.Errorf("run 1: avg rating = %q, want 4.7 (preserved)", rows[1][colAverageRating])
	}
	
	// RUN 2: Eligible again - use primary, price updates, ratings still preserved
	eligible = true
	_, err = SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	rows = readCatalogRows(t, path)
	if rows[1][colCurrentPriceUSD] != "110" {
		t.Errorf("run 2: price = %q, want 110 (updated)", rows[1][colCurrentPriceUSD])
	}
	if rows[1][colRatingCount] != "500" {
		t.Errorf("run 2: rating count = %q, want 500 (still preserved)", rows[1][colRatingCount])
	}
	if rows[1][colAverageRating] != "4.7" {
		t.Errorf("run 2: avg rating = %q, want 4.7 (still preserved)", rows[1][colAverageRating])
	}
	if rows[1][colImageURL] != "https://m.media-amazon.com/new.jpg" {
		t.Errorf("run 2: image = %q, want new.jpg (updated from primary)", rows[1][colImageURL])
	}
}

// TestNoLatchingToFallback verifies that the sync doesn't permanently latch to
// the fallback source - it always tries primary first on each run.
func TestNoLatchingToFallback(t *testing.T) {
	asins := []string{"B0AAA"}
	path := writeTestCatalog(t, asins)
	
	primaryTries := 0
	primary := &fakeDynamicSource{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			primaryTries++
			return nil, fmt.Errorf("always fails: %w", ErrSourceUnavailable)
		},
	}
	
	fallback := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 50, InStock: true},
		},
	}
	
	// Run sync 3 times - should try primary every time
	for i := 1; i <= 3; i++ {
		primaryTries = 0
		
		_, err := SyncCSVWithSources(context.Background(),
			Sources{Primary: primary, Fallback: fallback},
			path, SyncOptions{})
		if err != nil {
			t.Fatal(err)
		}
		
		if primaryTries == 0 {
			t.Errorf("run %d: primary not tried (latched to fallback)", i)
		}
	}
}

// TestMidRunEligibilityLossDoesNotRetryPrimary verifies that after eligibility
// is lost mid-run (during lookup), we don't keep trying primary for each
// remaining ASIN.
func TestMidRunEligibilityLossDoesNotRetryPrimary(t *testing.T) {
	asins := []string{"B0001", "B0002", "B0003", "B0004", "B0005"}
	path := writeTestCatalog(t, asins)
	
	lookupAttempts := 0
	primary := &fakeDynamicSource{
		name: "creators-api",
		lookupFunc: func(ctx context.Context, asin string) (*ProductResult, error) {
			lookupAttempts++
			// Fail on first lookup
			if lookupAttempts == 1 {
				return nil, fmt.Errorf("eligibility lapsed: %w", ErrSourceUnavailable)
			}
			// Should not be called again
			return nil, fmt.Errorf("unexpected call after failover")
		},
	}
	
	fallback := &fakeSource{
		name: "rainforest",
		results: make(map[string]*ProductResult),
	}
	for _, asin := range asins {
		fallback.results[asin] = &ProductResult{ASIN: asin, Price: 10, InStock: true}
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, Fallback: fallback},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	if result.Total != 5 {
		t.Errorf("total = %d, want 5", result.Total)
	}
	
	// Should have tried primary exactly once, then switched to fallback
	if lookupAttempts != 1 {
		t.Errorf("primary lookup attempts = %d, want 1 (then failed over)", lookupAttempts)
	}
	
	// All 5 should have been processed via fallback
	if len(fallback.calls) != 5 {
		t.Errorf("fallback calls = %d, want 5", len(fallback.calls))
	}
}

// TestLoggingRedactsCredentials verifies that error messages don't expose
// sensitive information.
func TestLoggingRedactsCredentials(t *testing.T) {
	tests := []struct {
		name  string
		err   string
		want  string
		safe  bool
	}{
		{
			name: "safe error",
			err:  "product source unavailable",
			want: "product source unavailable",
			safe: true,
		},
		{
			name: "error with client_secret",
			err:  "auth failed: client_secret=SECRETVALUE invalid",
			want: "auth failed: client_secret=[REDACTED]",
			safe: false,
		},
		{
			name: "error with api_key",
			err:  "request denied: api_key=12345 expired",
			want: "request denied: api_key=[REDACTED]",
			safe: false,
		},
		{
			name: "error with bearer token",
			err:  "request failed: Authorization: Bearer TOKENVALUE",
			want: "request failed: Authorization: Bearer [REDACTED]",
			safe: false,
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := redactError(fmt.Errorf("%s", tt.err))
			if tt.safe && got != tt.want {
				t.Errorf("safe error changed: got %q, want %q", got, tt.want)
			}
			if !tt.safe && !strings.Contains(got, "[REDACTED]") {
				t.Errorf("unsafe error not redacted: got %q", got)
			}
			if !tt.safe && strings.Contains(got, strings.ToUpper("secret")) && !strings.Contains(got, "[REDACTED]") {
				t.Errorf("credential still visible: got %q", got)
			}
		})
	}
}
