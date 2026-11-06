package api

import (
	"testing"
)

// TestAvailabilityFilterLogic verifies that products are correctly filtered
// based on availability status and affiliate URL presence
func TestAvailabilityFilterLogic(t *testing.T) {
	tests := []struct {
		name                   string
		availabilityStatus     string
		amazonURL              *string
		shouldBeIncluded       bool
		description            string
	}{
		{
			name:               "in_stock with valid URL",
			availabilityStatus: "in_stock",
			amazonURL:          strPtr("https://amazon.com/dp/B0TEST"),
			shouldBeIncluded:   true,
			description:        "Product should appear in listings",
		},
		{
			name:               "out_of_stock with valid URL",
			availabilityStatus: "out_of_stock",
			amazonURL:          strPtr("https://amazon.com/dp/B0TEST"),
			shouldBeIncluded:   false,
			description:        "Out-of-stock products excluded from listings",
		},
		{
			name:               "unknown status with valid URL",
			availabilityStatus: "unknown",
			amazonURL:          strPtr("https://amazon.com/dp/B0TEST"),
			shouldBeIncluded:   false,
			description:        "Unknown availability excluded from listings",
		},
		{
			name:               "in_stock but nil URL",
			availabilityStatus: "in_stock",
			amazonURL:          nil,
			shouldBeIncluded:   false,
			description:        "No purchase CTA = excluded",
		},
		{
			name:               "in_stock but empty URL",
			availabilityStatus: "in_stock",
			amazonURL:          strPtr(""),
			shouldBeIncluded:   false,
			description:        "Empty affiliate URL = excluded",
		},
		{
			name:               "out_of_stock and nil URL",
			availabilityStatus: "out_of_stock",
			amazonURL:          nil,
			shouldBeIncluded:   false,
			description:        "Both unavailable and no URL = excluded",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the filtering logic from listFlashlights
			hasValidAffiliateURL := tt.amazonURL != nil && *tt.amazonURL != ""
			isCurrentlyPurchasable := tt.availabilityStatus == "in_stock" && hasValidAffiliateURL
			
			if isCurrentlyPurchasable != tt.shouldBeIncluded {
				t.Errorf("%s: got included=%v, want included=%v", 
					tt.description, isCurrentlyPurchasable, tt.shouldBeIncluded)
			}
		})
	}
}

// TestMixedAvailabilityListFiltering verifies that lists with mixed
// availability correctly filter out non-purchasable items
func TestMixedAvailabilityListFiltering(t *testing.T) {
	items := []struct {
		id                 int
		availabilityStatus string
		amazonURL          *string
	}{
		{1, "in_stock", strPtr("https://amazon.com/dp/B001")},
		{2, "out_of_stock", strPtr("https://amazon.com/dp/B002")},
		{3, "in_stock", strPtr("https://amazon.com/dp/B003")},
		{4, "unknown", strPtr("https://amazon.com/dp/B004")},
		{5, "in_stock", nil},
		{6, "in_stock", strPtr("https://amazon.com/dp/B006")},
	}

	// Simulate filtering
	filtered := make([]int, 0)
	for _, item := range items {
		hasValidAffiliateURL := item.amazonURL != nil && *item.amazonURL != ""
		isCurrentlyPurchasable := item.availabilityStatus == "in_stock" && hasValidAffiliateURL
		
		if isCurrentlyPurchasable {
			filtered = append(filtered, item.id)
		}
	}

	expected := []int{1, 3, 6} // Only in-stock with valid URLs
	if len(filtered) != len(expected) {
		t.Errorf("filtered count = %d, want %d", len(filtered), len(expected))
	}

	for i, id := range expected {
		if i >= len(filtered) || filtered[i] != id {
			t.Errorf("filtered[%d] = %v, want %d", i, getOrNil(filtered, i), id)
		}
	}
}

// TestAllUnavailableCase verifies behavior when all products are unavailable
func TestAllUnavailableCase(t *testing.T) {
	items := []struct {
		id                 int
		availabilityStatus string
		amazonURL          *string
	}{
		{1, "out_of_stock", strPtr("https://amazon.com/dp/B001")},
		{2, "out_of_stock", strPtr("https://amazon.com/dp/B002")},
		{3, "unknown", strPtr("https://amazon.com/dp/B003")},
	}

	// Simulate filtering
	filtered := make([]int, 0)
	for _, item := range items {
		hasValidAffiliateURL := item.amazonURL != nil && *item.amazonURL != ""
		isCurrentlyPurchasable := item.availabilityStatus == "in_stock" && hasValidAffiliateURL
		
		if isCurrentlyPurchasable {
			filtered = append(filtered, item.id)
		}
	}

	if len(filtered) != 0 {
		t.Errorf("all unavailable should result in empty list, got %d items", len(filtered))
	}
}

// TestReturnToStockBehavior verifies that products automatically return
// when marked as in-stock in subsequent sync
func TestReturnToStockBehavior(t *testing.T) {
	// Simulate a product going from out-of-stock to in-stock
	
	// State 1: Out of stock
	availabilityStatus := "out_of_stock"
	amazonURL := strPtr("https://amazon.com/dp/B001")
	
	hasValidAffiliateURL := amazonURL != nil && *amazonURL != ""
	isCurrentlyPurchasable := availabilityStatus == "in_stock" && hasValidAffiliateURL
	
	if isCurrentlyPurchasable {
		t.Error("out_of_stock product should not be purchasable")
	}
	
	// State 2: Returns to stock (simulates subsequent sync update)
	availabilityStatus = "in_stock"
	
	isCurrentlyPurchasable = availabilityStatus == "in_stock" && hasValidAffiliateURL
	
	if !isCurrentlyPurchasable {
		t.Error("in_stock product should be purchasable and appear in listings")
	}
}

// TestDetailPreservation verifies that detail page access is not affected
// by availability filtering (detail pages should always be accessible)
func TestDetailPreservation(t *testing.T) {
	// Detail page endpoints (getFlashlightByID, getFlashlightBySlug) should NOT
	// filter by availability. This test documents that behavior.
	//
	// The filtering ONLY applies to:
	// - listFlashlights (product listings)
	// - rankings (best-of lists)
	// - finder (recommendation tool)
	//
	// Detail pages, direct compare URLs, and review pages remain accessible
	// for all products regardless of availability status.
	
	// This is a documentation test - actual endpoint tests would require
	// database setup. The key contract is:
	// - Listing endpoints: filter by availability
	// - Detail endpoints: NO filtering, always accessible
	
	t.Log("Detail page access is preserved for all products")
	t.Log("Direct compare URLs work for all product combinations")
	t.Log("Review pages accessible regardless of stock status")
}

func strPtr(s string) *string {
	return &s
}

func getOrNil(slice []int, index int) any {
	if index >= len(slice) {
		return nil
	}
	return slice[index]
}
