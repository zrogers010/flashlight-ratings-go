package rainforest

import (
	"context"
	"testing"
)

// TestSyncLimitEnforcement verifies SYNC_LIMIT caps the number of rows processed,
// which bounds Rainforest API usage even when ratings reinforcement is enabled.
func TestSyncLimitEnforcement(t *testing.T) {
	asins := []string{"B0001", "B0002", "B0003", "B0004", "B0005"}
	path := writeTestCatalog(t, asins)
	
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0001": {ASIN: "B0001", Price: 10, InStock: true},
			"B0002": {ASIN: "B0002", Price: 20, InStock: true},
			"B0003": {ASIN: "B0003", Price: 30, InStock: true},
			"B0004": {ASIN: "B0004", Price: 40, InStock: true},
			"B0005": {ASIN: "B0005", Price: 50, InStock: true},
		},
	}
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0001": {Rating: 4.5, RatingsTotal: 100},
			"B0002": {Rating: 4.6, RatingsTotal: 200},
			"B0003": {Rating: 4.7, RatingsTotal: 300},
			"B0004": {Rating: 4.8, RatingsTotal: 400},
			"B0005": {Rating: 4.9, RatingsTotal: 500},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path,
		SyncOptions{Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	
	// Only 3 rows should be processed due to SYNC_LIMIT
	if result.Total != 3 {
		t.Errorf("Total processed = %d, want 3 (SYNC_LIMIT)", result.Total)
	}
	if result.Skipped != 2 {
		t.Errorf("Skipped = %d, want 2", result.Skipped)
	}
	
	// Rainforest ratings should only be called for the processed rows
	if len(ratingsSource.calls) != 3 {
		t.Errorf("Rainforest rating calls = %d, want 3 (limited by SYNC_LIMIT)", len(ratingsSource.calls))
	}
}

// TestSyncRotateDaysBudget verifies rotation mode processes only the selected shard,
// spreading API usage across multiple days.
func TestSyncRotateDaysBudget(t *testing.T) {
	// Create a catalog with 9 ASINs (3 shards of 3 for ROTATE_DAYS=3)
	asins := make([]string, 9)
	for i := 0; i < 9; i++ {
		asins[i] = "B000" + string(rune('1'+i))
	}
	path := writeTestCatalog(t, asins)
	
	primary := &fakeSource{
		name: "creators-api",
		results: make(map[string]*ProductResult),
	}
	for _, asin := range asins {
		primary.results[asin] = &ProductResult{ASIN: asin, Price: 10, InStock: true}
	}
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: make(map[string]*ProductResult),
	}
	for _, asin := range asins {
		ratingsSource.results[asin] = &ProductResult{Rating: 4.5, RatingsTotal: 100}
	}
	
	// With ROTATE_DAYS=3, only ~1/3 of ASINs should be processed
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path,
		SyncOptions{RotateDays: 3})
	if err != nil {
		t.Fatal(err)
	}
	
	// Should process exactly 3 ASINs (shard size)
	if result.Total != 3 {
		t.Errorf("Total processed = %d, want 3 (1/3 of 9 ASINs)", result.Total)
	}
	if result.Skipped != 6 {
		t.Errorf("Skipped = %d, want 6", result.Skipped)
	}
	
	// Rainforest should only be called for the processed shard
	if len(ratingsSource.calls) != 3 {
		t.Errorf("Rainforest rating calls = %d, want 3 (1 shard)", len(ratingsSource.calls))
	}
}

// TestSyncRotationTakesPrecedenceOverLimit verifies that when both ROTATE_DAYS
// and LIMIT are set, ROTATE_DAYS takes precedence (they're mutually exclusive).
func TestSyncRotationTakesPrecedenceOverLimit(t *testing.T) {
	asins := make([]string, 10)
	for i := 0; i < 10; i++ {
		asins[i] = "B00" + string(rune('0'+i))
	}
	path := writeTestCatalog(t, asins)
	
	primary := &fakeSource{
		name: "creators-api",
		results: make(map[string]*ProductResult),
	}
	for _, asin := range asins {
		primary.results[asin] = &ProductResult{ASIN: asin, Price: 10, InStock: true}
	}
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: make(map[string]*ProductResult),
	}
	for _, asin := range asins {
		ratingsSource.results[asin] = &ProductResult{Rating: 4.5, RatingsTotal: 100}
	}
	
	// When both are set, ROTATE_DAYS takes precedence (per code comments)
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path,
		SyncOptions{RotateDays: 2, Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	
	// Should process rotation shard size (5 for 10 ASINs with RotateDays=2)
	// not LIMIT (3), since rotation takes precedence
	if result.Total != 5 {
		t.Errorf("Total processed = %d, want 5 (rotation shard, not limit)", result.Total)
	}
	
	// Rainforest calls should match rotation shard
	if len(ratingsSource.calls) != 5 {
		t.Errorf("Rainforest rating calls = %d, want 5", len(ratingsSource.calls))
	}
}

// TestSyncNoRatingsReinforcementWhenPrimaryProvidesThem verifies that when
// the primary source provides ratings, RatingsFrom is not consulted.
func TestSyncNoRatingsReinforcementWhenPrimaryProvidesThem(t *testing.T) {
	path := writeTestCatalog(t, []string{"B0AAA"})
	
	// Primary provides complete data including ratings
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0AAA": {ASIN: "B0AAA", Price: 30, InStock: true, Rating: 4.8, RatingsTotal: 250},
		},
	}
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0AAA": {Rating: 4.2, RatingsTotal: 120},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// Rainforest should NOT be called when primary has ratings
	if len(ratingsSource.calls) > 0 {
		t.Errorf("RatingsFrom called %d times, want 0 (primary provided ratings)", len(ratingsSource.calls))
	}
	
	rows := readCatalogRows(t, path)
	if got := rows[1][colRatingCount]; got != "250" {
		t.Errorf("rating count = %q, want 250 (from primary)", got)
	}
	if got := rows[1][colAverageRating]; got != "4.8" {
		t.Errorf("avg rating = %q, want 4.8 (from primary)", got)
	}
	
	if result.Updated != 1 {
		t.Errorf("Updated = %d, want 1", result.Updated)
	}
}

// TestSyncRatingsReinforcementOnlyWhenNeeded verifies mixed scenario where
// some ASINs have ratings from primary and some need reinforcement.
func TestSyncRatingsReinforcementOnlyWhenNeeded(t *testing.T) {
	asins := []string{"B0001", "B0002", "B0003"}
	path := writeTestCatalog(t, asins)
	
	// Primary provides ratings for B0001 only
	primary := &fakeSource{
		name: "creators-api",
		results: map[string]*ProductResult{
			"B0001": {ASIN: "B0001", Price: 10, InStock: true, Rating: 4.5, RatingsTotal: 100},
			"B0002": {ASIN: "B0002", Price: 20, InStock: true}, // no ratings
			"B0003": {ASIN: "B0003", Price: 30, InStock: true}, // no ratings
		},
	}
	
	ratingsSource := &fakeSource{
		name: "rainforest",
		results: map[string]*ProductResult{
			"B0001": {Rating: 4.9, RatingsTotal: 999}, // should not be used
			"B0002": {Rating: 4.6, RatingsTotal: 200},
			"B0003": {Rating: 4.7, RatingsTotal: 300},
		},
	}
	
	result, err := SyncCSVWithSources(context.Background(),
		Sources{Primary: primary, RatingsFrom: ratingsSource},
		path, SyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	
	// Rainforest should only be called for B0002 and B0003
	if len(ratingsSource.calls) != 2 {
		t.Errorf("RatingsFrom called %d times, want 2 (only for missing ratings)", len(ratingsSource.calls))
	}
	
	rows := readCatalogRows(t, path)
	// B0001 should use primary's ratings
	if got := rows[1][colRatingCount]; got != "100" {
		t.Errorf("B0001 rating count = %q, want 100 (from primary)", got)
	}
	// B0002 should use reinforced ratings
	if got := rows[2][colRatingCount]; got != "200" {
		t.Errorf("B0002 rating count = %q, want 200 (from rainforest)", got)
	}
	// B0003 should use reinforced ratings
	if got := rows[3][colRatingCount]; got != "300" {
		t.Errorf("B0003 rating count = %q, want 300 (from rainforest)", got)
	}
	
	if result.Updated != 3 {
		t.Errorf("Updated = %d, want 3", result.Updated)
	}
}
