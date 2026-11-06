package amazon

import (
	"fmt"
	"testing"
)

func TestAvailabilityInStock(t *testing.T) {
	tests := []struct {
		name         string
		availability string
		want         bool
	}{
		// Standard Creators API formats
		{name: "Creators IN_STOCK uppercase", availability: "IN_STOCK", want: true},
		{name: "Creators OUT_OF_STOCK uppercase", availability: "OUT_OF_STOCK", want: false},
		
		// Normalized variants
		{name: "Creators In Stock with spaces", availability: "In Stock", want: true},
		{name: "lowercase in_stock", availability: "in_stock", want: true},
		{name: "lowercase available", availability: "available", want: true},
		
		// Legacy PA-API format
		{name: "PA-API Now", availability: "Now", want: true},
		{name: "PA-API now lowercase", availability: "now", want: true},
		
		// Empty/missing
		{name: "empty string (no offers)", availability: "", want: false},
		{name: "whitespace only", availability: "   ", want: false},
		
		// Unknown statuses (should be false)
		{name: "TEMPORARILY_UNAVAILABLE", availability: "TEMPORARILY_UNAVAILABLE", want: false},
		{name: "AVAILABLE_FOR_PREORDER", availability: "AVAILABLE_FOR_PREORDER", want: false},
		{name: "BACKORDER", availability: "BACKORDER", want: false},
		{name: "SOLD_OUT", availability: "SOLD_OUT", want: false},
		{name: "DISCONTINUED", availability: "DISCONTINUED", want: false},
		
		// Edge cases
		{name: "mixed case Available", availability: "Available", want: true},
		{name: "tabs and spaces", availability: "\t in_stock \n", want: true},
		{name: "multiple spaces", availability: "In    Stock", want: false}, // Multiple spaces don't normalize to single underscore
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := AvailabilityInStock(tt.availability)
			if got != tt.want {
				t.Errorf("AvailabilityInStock(%q) = %v, want %v", tt.availability, got, tt.want)
			}
		})
	}
}

func TestProductIsPurchasableExtended(t *testing.T) {
	price10 := 10.0
	price0 := 0.0
	priceNeg := -5.0

	tests := []struct {
		name string
		p    Product
		want bool
	}{
		{
			name: "valid price and IN_STOCK",
			p:    Product{OfferPrice: &price10, Availability: "IN_STOCK"},
			want: true,
		},
		{
			name: "valid price but OUT_OF_STOCK",
			p:    Product{OfferPrice: &price10, Availability: "OUT_OF_STOCK"},
			want: false,
		},
		{
			name: "valid price but empty availability (no offers)",
			p:    Product{OfferPrice: &price10, Availability: ""},
			want: false,
		},
		{
			name: "IN_STOCK but nil price",
			p:    Product{OfferPrice: nil, Availability: "IN_STOCK"},
			want: false,
		},
		{
			name: "IN_STOCK but zero price",
			p:    Product{OfferPrice: &price0, Availability: "IN_STOCK"},
			want: false,
		},
		{
			name: "IN_STOCK but negative price",
			p:    Product{OfferPrice: &priceNeg, Availability: "IN_STOCK"},
			want: false,
		},
		{
			name: "nil price and no availability",
			p:    Product{OfferPrice: nil, Availability: ""},
			want: false,
		},
		{
			name: "valid price with 'now' (legacy PA-API)",
			p:    Product{OfferPrice: &price10, Availability: "Now"},
			want: true,
		},
		{
			name: "valid price with 'available'",
			p:    Product{OfferPrice: &price10, Availability: "available"},
			want: true,
		},
		{
			name: "valid price but unknown status",
			p:    Product{OfferPrice: &price10, Availability: "TEMPORARILY_UNAVAILABLE"},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := productIsPurchasable(tt.p)
			if got != tt.want {
				t.Errorf("productIsPurchasable() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCreatorsItemAvailabilityParsing(t *testing.T) {
	// Test that the creatorsItem.toProduct() correctly extracts availability
	tests := []struct {
		name         string
		item         creatorsItem
		wantPrice    *float64
		wantAvail    string
		wantPurch    bool
	}{
		{
			name: "buy box winner with IN_STOCK",
			item: creatorsItem{
				ASIN: "B0TEST0001",
				OffersV2: struct {
					Listings []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					} `json:"listings"`
				}{
					Listings: []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					}{
						{
							Price: struct {
								Money creatorsMoney `json:"money"`
							}{
								Money: creatorsMoney{Amount: floatPtr(49.99)},
							},
							Availability: struct {
								Type    string `json:"type"`
								Message string `json:"message"`
							}{
								Type: "IN_STOCK",
							},
							MerchantInfo: struct {
								Name string `json:"name"`
							}{
								Name: "Amazon.com",
							},
							IsBuyBoxWinner: true,
						},
					},
				},
			},
			wantPrice: floatPtr(49.99),
			wantAvail: "IN_STOCK",
			wantPurch: true,
		},
		{
			name: "no buy box winner, uses first listing",
			item: creatorsItem{
				ASIN: "B0TEST0002",
				OffersV2: struct {
					Listings []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					} `json:"listings"`
				}{
					Listings: []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					}{
						{
							Price: struct {
								Money creatorsMoney `json:"money"`
							}{
								Money: creatorsMoney{Amount: floatPtr(29.99)},
							},
							Availability: struct {
								Type    string `json:"type"`
								Message string `json:"message"`
							}{
								Type: "IN_STOCK",
							},
							MerchantInfo: struct {
								Name string `json:"name"`
							}{
								Name: "ThirdParty Seller",
							},
							IsBuyBoxWinner: false,
						},
					},
				},
			},
			wantPrice: floatPtr(29.99),
			wantAvail: "IN_STOCK",
			wantPurch: true,
		},
		{
			name: "OUT_OF_STOCK with price",
			item: creatorsItem{
				ASIN: "B0TEST0003",
				OffersV2: struct {
					Listings []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					} `json:"listings"`
				}{
					Listings: []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					}{
						{
							Price: struct {
								Money creatorsMoney `json:"money"`
							}{
								Money: creatorsMoney{Amount: floatPtr(19.99)},
							},
							Availability: struct {
								Type    string `json:"type"`
								Message string `json:"message"`
							}{
								Type: "OUT_OF_STOCK",
							},
							IsBuyBoxWinner: true,
						},
					},
				},
			},
			wantPrice: floatPtr(19.99),
			wantAvail: "OUT_OF_STOCK",
			wantPurch: false,
		},
		{
			name: "no offers (empty listings)",
			item: creatorsItem{
				ASIN: "B0TEST0004",
				OffersV2: struct {
					Listings []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					} `json:"listings"`
				}{
					Listings: []struct {
						Price struct {
							Money creatorsMoney `json:"money"`
						} `json:"price"`
						Availability struct {
							Type    string `json:"type"`
							Message string `json:"message"`
						} `json:"availability"`
						MerchantInfo struct {
							Name string `json:"name"`
						} `json:"merchantInfo"`
						IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
					}{},
				},
			},
			wantPrice: nil,
			wantAvail: "",
			wantPurch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := tt.item.toProduct()
			
			if !equalFloatPtr(p.OfferPrice, tt.wantPrice) {
				t.Errorf("OfferPrice = %v, want %v", formatFloatPtr(p.OfferPrice), formatFloatPtr(tt.wantPrice))
			}
			
			if p.Availability != tt.wantAvail {
				t.Errorf("Availability = %q, want %q", p.Availability, tt.wantAvail)
			}
			
			gotPurch := productIsPurchasable(p)
			if gotPurch != tt.wantPurch {
				t.Errorf("productIsPurchasable() = %v, want %v (price=%v, avail=%q)", 
					gotPurch, tt.wantPurch, formatFloatPtr(p.OfferPrice), p.Availability)
			}
		})
	}
}

// Helper functions

func floatPtr(f float64) *float64 {
	return &f
}

func equalFloatPtr(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func formatFloatPtr(f *float64) string {
	if f == nil {
		return "nil"
	}
	return fmt.Sprintf("%.2f", *f)
}
