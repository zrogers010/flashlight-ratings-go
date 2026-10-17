package api

// Offer represents an affiliate purchase option for a product.
type Offer struct {
	Provider            string  `json:"provider"`              // amazon, awin, avantlink
	MerchantName        string  `json:"merchant_name"`         // Olight, Fenix, or empty for Amazon
	AffiliateURL        string  `json:"affiliate_url"`
	ASIN                string  `json:"asin,omitempty"`        // Amazon-specific
	IsPrimary           bool    `json:"is_primary"`
	CommissionRatePct   float64 `json:"commission_rate_pct"`   // e.g. 10.0 = 10%
	CookieDurationDays  int     `json:"cookie_duration_days"`  // e.g. 30
}

// ProductOffers holds all available purchase options for a product.
type ProductOffers struct {
	PrimaryOffer     *Offer  `json:"primary_offer,omitempty"`
	AlternateOffers  []Offer `json:"alternate_offers,omitempty"`
}
