package amazon

import "testing"

func TestProductIsPurchasable(t *testing.T) {
	price := 49.99
	tests := []struct {
		name string
		p    Product
		want bool
	}{
		{name: "available now", p: Product{OfferPrice: &price, Availability: "Now"}, want: true},
		{name: "rainforest-style in stock", p: Product{OfferPrice: &price, Availability: "in_stock"}, want: true},
		{name: "future availability", p: Product{OfferPrice: &price, Availability: "Future"}, want: false},
		{name: "missing availability", p: Product{OfferPrice: &price}, want: false},
		{name: "missing price", p: Product{Availability: "Now"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := productIsPurchasable(tt.p); got != tt.want {
				t.Fatalf("productIsPurchasable() = %v, want %v", got, tt.want)
			}
		})
	}
}
