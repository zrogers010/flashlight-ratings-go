package rainforest

import (
	"testing"
	"time"
)

// fixedTime returns a func suitable for SyncOptions.Now that always returns
// Jan 1 + dayOffset days (UTC), giving a predictable YearDay for tests.
func fixedTime(dayOffset int) func() time.Time {
	return func() time.Time {
		return time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC).AddDate(0, 0, dayOffset)
	}
}

func TestRowSelector_DefaultIncludesAll(t *testing.T) {
	sel := newRowSelector(SyncOptions{}, 10)
	for i := 0; i < 10; i++ {
		if !sel.includes(i) {
			t.Errorf("default selector should include row %d", i)
		}
	}
	if sel.label != "" {
		t.Errorf("default selector should have empty label, got %q", sel.label)
	}
}

func TestRowSelector_LimitOffset(t *testing.T) {
	sel := newRowSelector(SyncOptions{Limit: 3, Offset: 5}, 20)
	want := map[int]bool{5: true, 6: true, 7: true}
	for i := 0; i < 20; i++ {
		got := sel.includes(i)
		if got != want[i] {
			t.Errorf("row %d: includes=%v, want %v", i, got, want[i])
		}
	}
	if sel.selectedCount != 3 {
		t.Errorf("selectedCount = %d, want 3", sel.selectedCount)
	}
}

func TestRowSelector_LimitOffsetClampsToCSVSize(t *testing.T) {
	sel := newRowSelector(SyncOptions{Limit: 100, Offset: 8}, 10)
	if sel.selectedCount != 2 {
		t.Errorf("selectedCount = %d, want 2 (clamped)", sel.selectedCount)
	}
	if !sel.includes(8) || !sel.includes(9) {
		t.Error("expected rows 8,9 to be included")
	}
	if sel.includes(10) {
		t.Error("row 10 (out of range) should not be included")
	}
}

func TestRowSelector_LimitOffsetNegativeOffsetTreatedAsZero(t *testing.T) {
	sel := newRowSelector(SyncOptions{Limit: 2, Offset: -5}, 10)
	if !sel.includes(0) || !sel.includes(1) {
		t.Error("negative offset should be clamped to 0")
	}
	if sel.includes(2) {
		t.Error("row 2 should be outside the limit")
	}
}

func TestRowSelector_RotateDays_PartitionsCatalogExactlyOncePerCycle(t *testing.T) {
	const dataRows = 110
	const rotateDays = 7

	// Track which rows are picked across one full rotation cycle.
	seen := make(map[int]int) // row -> number of times picked
	for day := 0; day < rotateDays; day++ {
		sel := newRowSelector(SyncOptions{
			RotateDays: rotateDays,
			Now:        fixedTime(day),
		}, dataRows)
		for i := 0; i < dataRows; i++ {
			if sel.includes(i) {
				seen[i]++
			}
		}
	}

	// Every row must be picked exactly once across the cycle.
	if len(seen) != dataRows {
		t.Errorf("rows visited = %d, want %d", len(seen), dataRows)
	}
	for i := 0; i < dataRows; i++ {
		if seen[i] != 1 {
			t.Errorf("row %d picked %d times across cycle, want exactly 1", i, seen[i])
		}
	}
}

func TestRowSelector_RotateDays_ShardSizeRoughlyEqual(t *testing.T) {
	const dataRows = 110
	const rotateDays = 7

	min, max := dataRows, 0
	for day := 0; day < rotateDays; day++ {
		sel := newRowSelector(SyncOptions{RotateDays: rotateDays, Now: fixedTime(day)}, dataRows)
		if sel.selectedCount < min {
			min = sel.selectedCount
		}
		if sel.selectedCount > max {
			max = sel.selectedCount
		}
	}
	// 110/7 = ~15.7, so daily slice should be 15 or 16.
	if max-min > 1 {
		t.Errorf("shard sizes too uneven: min=%d max=%d (want diff <= 1)", min, max)
	}
	if min < 15 || max > 16 {
		t.Errorf("expected daily slice ∈ [15,16], got min=%d max=%d", min, max)
	}
}

func TestRowSelector_RotateDays_TakesPrecedenceOverLimitOffset(t *testing.T) {
	// When RotateDays is set, Limit/Offset must be ignored.
	sel := newRowSelector(SyncOptions{
		RotateDays: 7,
		Limit:      999,
		Offset:     999,
		Now:        fixedTime(0),
	}, 14)

	if sel.selectedCount == 0 {
		t.Fatal("expected non-zero shard, got 0 (Limit/Offset clobbered rotation)")
	}
	if sel.label == "" || sel.label[:5] != "rotat" {
		t.Errorf("expected rotation label, got %q", sel.label)
	}
}

func TestRowSelector_RotateDaysOneIsDisabled(t *testing.T) {
	// RotateDays=1 means "every day refresh everything" — should behave like
	// the default (no slicing). RotateDays=0 also disables.
	for _, n := range []int{0, 1} {
		sel := newRowSelector(SyncOptions{RotateDays: n}, 10)
		if sel.selectedCount != 0 && sel.selectedCount != 10 {
			t.Errorf("RotateDays=%d: selectedCount=%d, want 0 or 10", n, sel.selectedCount)
		}
		for i := 0; i < 10; i++ {
			if !sel.includes(i) {
				t.Errorf("RotateDays=%d: row %d should be included", n, i)
			}
		}
	}
}

func TestRowSelector_EmptyCSVIsSafe(t *testing.T) {
	sel := newRowSelector(SyncOptions{RotateDays: 7, Now: fixedTime(0)}, 0)
	if sel.includes(0) {
		// includes can return whatever for an out-of-range index; we just
		// want to make sure it doesn't panic.
		t.Log("includes(0) on empty CSV returned true (harmless)")
	}
}

func TestUpdateOfferStateSoftDisablesAndRecovers(t *testing.T) {
	records := [][]string{make([]string, 36), make([]string, 36)}
	ensureAvailabilityColumns(records)
	row := records[1]
	row[colCurrentPriceUSD] = "49.99"
	state := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}

	unavailable := &ProductResult{ASIN: "B000000001", Price: 49.99, InStock: false}
	if _, missed := updateOfferState(row, state, "B000000001", "Brand", "Model", unavailable, 2); !missed {
		t.Fatal("first unavailable response was not reported")
	}
	if got := row[colAmazonPurchasable]; got != "true" {
		t.Fatalf("first miss should preserve offer during grace period, got %q", got)
	}

	if _, missed := updateOfferState(row, state, "B000000001", "Brand", "Model", unavailable, 2); !missed {
		t.Fatal("second unavailable response was not reported")
	}
	if got := row[colAmazonPurchasable]; got != "false" {
		t.Fatalf("second miss should soft-disable offer, got %q", got)
	}

	available := &ProductResult{ASIN: "B000000001", Price: 44.99, InStock: true}
	if _, missed := updateOfferState(row, state, "B000000001", "Brand", "Model", available, 2); missed {
		t.Fatal("purchasable response was reported unavailable")
	}
	if got := row[colAmazonPurchasable]; got != "true" {
		t.Fatalf("recovered offer should be enabled, got %q", got)
	}
	if got := row[colCurrentPriceUSD]; got != "44.99" {
		t.Fatalf("recovered price = %q, want 44.99", got)
	}
	if got := state.Entries["B000000001"].UnavailableRuns; got != 0 {
		t.Fatalf("recovered streak = %d, want 0", got)
	}
}

func TestUpdateOfferStateRequiresPriceAndStock(t *testing.T) {
	tests := []struct {
		name    string
		product ProductResult
	}{
		{name: "price but out of stock", product: ProductResult{ASIN: "B000000001", Price: 25, InStock: false}},
		{name: "in stock but no price", product: ProductResult{ASIN: "B000000001", InStock: true}},
		{name: "no buy box", product: ProductResult{}},
		{name: "mismatched ASIN", product: ProductResult{ASIN: "B000000002", Price: 25, InStock: true}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			records := [][]string{make([]string, 36), make([]string, 36)}
			ensureAvailabilityColumns(records)
			state := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}
			_, unavailable := updateOfferState(
				records[1], state, "B000000001", "Brand", "Model", &tt.product, 1,
			)
			if !unavailable {
				t.Fatal("offer should not be purchasable")
			}
			if got := records[1][colAmazonPurchasable]; got != "false" {
				t.Fatalf("offer status = %q, want false", got)
			}
		})
	}
}
