package discovery

import (
	"context"
	"testing"
	"time"

	"flashlight-ratings-go/internal/amazon"
	"flashlight-ratings-go/internal/rainforest"
)

type fakeSearcher struct {
	results map[string][]amazon.Product // keyed by brand
}

func (f *fakeSearcher) SearchItems(_ context.Context, q amazon.SearchQuery) ([]amazon.Product, error) {
	return f.results[q.Brand], nil
}

type fakeRatings struct {
	results map[string]*rainforest.ProductResult
}

func (f *fakeRatings) LookupProduct(_ context.Context, asin string) (*rainforest.ProductResult, error) {
	if p, ok := f.results[asin]; ok {
		return p, nil
	}
	return &rainforest.ProductResult{ASIN: asin}, nil
}

func fptr(v float64) *float64 { return &v }
func iptr(v int) *int         { return &v }

func product(asin, brand string, price float64, avail string, rating *float64, count *int) amazon.Product {
	var pp *float64
	if price > 0 {
		pp = &price
	}
	return amazon.Product{
		ASIN:          asin,
		Brand:         brand,
		Title:         brand + " TestLight 1000 Lumens",
		OfferPrice:    pp,
		Availability:  avail,
		AverageRating: rating,
		RatingCount:   count,
	}
}

func TestQualityGate(t *testing.T) {
	acebeam := BrandInfo{Name: "ACEBEAM", Slug: "acebeam"}
	searcher := &fakeSearcher{results: map[string][]amazon.Product{
		"ACEBEAM": {
			product("B0GOOD00001", "Acebeam", 79.99, "IN_STOCK", fptr(4.6), iptr(500)),   // passes (brand case-insensitive)
			product("B0KNOCKOFF1", "ShadyBrand", 9.99, "IN_STOCK", fptr(4.9), iptr(999)), // brand mismatch
			product("B0EXISTING1", "ACEBEAM", 50, "IN_STOCK", fptr(4.8), iptr(400)),      // already in catalog
			product("B0LOWRATE01", "ACEBEAM", 60, "IN_STOCK", fptr(3.9), iptr(400)),      // rating below min
			product("B0FEWRATE01", "ACEBEAM", 60, "IN_STOCK", fptr(4.8), iptr(20)),       // too few ratings
			product("B0NOSTOCK01", "ACEBEAM", 60, "OUT_OF_STOCK", fptr(4.8), iptr(400)),  // not purchasable
		},
	}}

	report, err := Run(context.Background(), Config{
		Search:        searcher,
		Brands:        []BrandInfo{acebeam},
		ExistingASINs: map[string]bool{"B0EXISTING1": true},
		Categories:    []Category{{Tag: "edc", Keywords: "EDC flashlight"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(report.Candidates) != 1 {
		t.Fatalf("candidates = %d, want 1: %+v (rejections %v)", len(report.Candidates), report.Candidates, report.Rejected)
	}
	if report.Candidates[0].ASIN != "B0GOOD00001" {
		t.Errorf("candidate = %s", report.Candidates[0].ASIN)
	}
	for _, reason := range []string{"brand mismatch", "already in catalog", "no purchasable offer"} {
		if report.Rejected[reason] == 0 {
			t.Errorf("expected a %q rejection, got %v", reason, report.Rejected)
		}
	}
}

func TestGateUsesRainforestRatingsWhenGated(t *testing.T) {
	brand := BrandInfo{Name: "Fenix", Slug: "fenix"}
	searcher := &fakeSearcher{results: map[string][]amazon.Product{
		"Fenix": {
			product("B0GATED0001", "Fenix", 99, "IN_STOCK", nil, nil), // no ratings from creators
		},
	}}
	ratings := &fakeRatings{results: map[string]*rainforest.ProductResult{
		"B0GATED0001": {ASIN: "B0GATED0001", Rating: 4.7, RatingsTotal: 800},
	}}

	report, err := Run(context.Background(), Config{
		Search:     searcher,
		Ratings:    ratings,
		Brands:     []BrandInfo{brand},
		Categories: []Category{{Tag: "edc", Keywords: "EDC flashlight"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Candidates) != 1 {
		t.Fatalf("candidates = %d, want 1 (rejections %v)", len(report.Candidates), report.Rejected)
	}
	c := report.Candidates[0]
	if c.Rating != 4.7 || c.RatingCount != 800 {
		t.Errorf("candidate ratings = %v/%v, want reinforced 4.7/800", c.Rating, c.RatingCount)
	}
}

func TestParentASINDedupe(t *testing.T) {
	brand := BrandInfo{Name: "Olight", Slug: "olight"}
	p1 := product("B0VAR000001", "Olight", 60, "IN_STOCK", fptr(4.6), iptr(300))
	p1.ParentASIN = "B0PARENT001"
	p2 := product("B0VAR000002", "Olight", 62, "IN_STOCK", fptr(4.6), iptr(300))
	p2.ParentASIN = "B0PARENT001"

	searcher := &fakeSearcher{results: map[string][]amazon.Product{"Olight": {p1, p2}}}
	report, err := Run(context.Background(), Config{
		Search:     searcher,
		Brands:     []BrandInfo{brand},
		Categories: []Category{{Tag: "edc", Keywords: "EDC flashlight"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Candidates) != 1 {
		t.Fatalf("candidates = %d, want 1 (variant dedupe); rejections %v", len(report.Candidates), report.Rejected)
	}
	if report.Rejected["variant of known product"] != 1 {
		t.Errorf("rejections = %v", report.Rejected)
	}
}

func TestCategoryTagsMerge(t *testing.T) {
	brand := BrandInfo{Name: "Sofirn", Slug: "sofirn"}
	p := product("B0MULTI0001", "Sofirn", 30, "IN_STOCK", fptr(4.5), iptr(900))
	searcher := &fakeSearcher{results: map[string][]amazon.Product{"Sofirn": {p}}}

	report, err := Run(context.Background(), Config{
		Search: searcher,
		Brands: []BrandInfo{brand},
		Categories: []Category{
			{Tag: "edc", Keywords: "EDC flashlight"},
			{Tag: "tactical", Keywords: "tactical flashlight"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Candidates) != 1 {
		t.Fatalf("candidates = %d, want 1", len(report.Candidates))
	}
	tags := report.Candidates[0].Tags
	if len(tags) != 2 || tags[0] != "edc" || tags[1] != "tactical" {
		t.Errorf("tags = %v, want [edc tactical]", tags)
	}
}

func TestExtractSpecs(t *testing.T) {
	title := "ACEBEAM E75 Flashlight 3,000 Lumens USB-C Rechargeable 21700 EDC Torch IP68 Waterproof"
	features := []string{"260 meters beam distance for outdoor use", "Powered by a 5000mAh 21700 battery"}

	specs := extractSpecs(title, features)
	if specs["max_lumens"] != "3000" {
		t.Errorf("max_lumens = %q, want 3000", specs["max_lumens"])
	}
	if specs["battery_type"] != "21700" {
		t.Errorf("battery_type = %q, want 21700", specs["battery_type"])
	}
	if specs["recharge_type"] != "usb-c" {
		t.Errorf("recharge_type = %q, want usb-c", specs["recharge_type"])
	}
	if specs["waterproof_rating"] != "IP68" {
		t.Errorf("waterproof_rating = %q, want IP68", specs["waterproof_rating"])
	}
	if specs["beam_distance_m"] != "260" {
		t.Errorf("beam_distance_m = %q, want 260", specs["beam_distance_m"])
	}
}

func TestExtractModelName(t *testing.T) {
	tests := []struct {
		brand, title, want string
	}{
		{"ACEBEAM", "ACEBEAM E75 Flashlight, 3000 Lumens EDC", "E75 Flashlight"},
		{"Olight", "OLIGHT Warrior 3S 2300 Lumens Tactical Flashlight, Rechargeable", "Warrior 3S 2300 Lumens Tactical"},
		{"Fenix", "Fenix PD36R Pro (Upgraded) Rechargeable", "PD36R Pro"},
	}
	for _, tt := range tests {
		if got := extractModelName(tt.brand, tt.title); got != tt.want {
			t.Errorf("extractModelName(%q, %q) = %q, want %q", tt.brand, tt.title, got, tt.want)
		}
	}
}

func TestCandidateRowFollowsHeaderOrder(t *testing.T) {
	header := []string{"brand_name", "asin", "model_slug", "current_price_usd", "use_case_tags", "amazon_purchasable"}
	c := Candidate{
		Brand:     BrandInfo{Name: "Fenix", Slug: "fenix"},
		ASIN:      "B0TEST00001",
		ModelName: "PD36R Pro",
		Price:     99.95,
		Tags:      []string{"edc", "tactical"},
		FoundAt:   time.Now().UTC(),
	}
	row := candidateRow(header, c, "tag-20")
	want := []string{"Fenix", "B0TEST00001", "fenix-pd36r-pro", "99.95", "edc,tactical", "true"}
	for i := range want {
		if row[i] != want[i] {
			t.Errorf("col %s = %q, want %q", header[i], row[i], want[i])
		}
	}
}
