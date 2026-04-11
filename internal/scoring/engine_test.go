package scoring

import (
	"database/sql"
	"encoding/json"
	"testing"
)

func TestNormalizeBounds(t *testing.T) {
	if got := normalizeHigherLinear(10, 20, 100); got != 0 {
		t.Fatalf("expected 0 below floor, got %v", got)
	}
	if got := normalizeHigherLinear(150, 20, 100); got != 100 {
		t.Fatalf("expected 100 above cap, got %v", got)
	}
	if got := normalizeLowerLinear(20, 20, 100); got != 100 {
		t.Fatalf("expected 100 at best, got %v", got)
	}
	if got := normalizeLowerLinear(100, 20, 100); got != 0 {
		t.Fatalf("expected 0 at worst, got %v", got)
	}
}

func nf(v float64) sql.NullFloat64 { return sql.NullFloat64{Float64: v, Valid: true} }
func ns(v string) sql.NullString   { return sql.NullString{String: v, Valid: true} }

func TestComputeScoresWithAmazon(t *testing.T) {
	row := SpecRow{
		FlashlightID:      1,
		MaxLumens:         nf(1800),
		MaxCandela:        nf(45000),
		BeamDistanceM:     nf(420),
		RuntimeMediumMin:  nf(240),
		RuntimeHighMin:    nf(95),
		WaterproofRating:  ns("IP68"),
		ImpactResistanceM: nf(1.5),
		PriceUSD:          nf(89.99),
		AmazonAvgRating:   nf(4.7),
		AmazonRatingCount: nf(2500),
	}

	scores, breakdown := computeScores(row, "v2")

	allScores := map[string]float64{
		"overall":  scores.Overall,
		"tactical": scores.Tactical,
		"edc":      scores.EDC,
		"value":    scores.Value,
		"throw":    scores.Throw,
		"flood":    scores.Flood,
	}

	for name, score := range allScores {
		if score <= 0 {
			t.Errorf("%s score should be positive, got %v", name, score)
		}
		if score > 100 {
			t.Errorf("%s score should be <= 100, got %v", name, score)
		}
	}

	// A well-reviewed (4.7*, 2500 reviews) premium flashlight should score well overall
	if scores.Overall < 50 {
		t.Errorf("overall score for a well-reviewed product should be > 50, got %v", scores.Overall)
	}

	var parsed map[string]any
	if err := json.Unmarshal(breakdown, &parsed); err != nil {
		t.Fatalf("invalid breakdown json: %v", err)
	}
	if _, ok := parsed["normalized"]; !ok {
		t.Fatal("expected normalized in breakdown")
	}

	t.Logf("Scores: overall=%.1f tactical=%.1f edc=%.1f value=%.1f throw=%.1f flood=%.1f",
		scores.Overall, scores.Tactical, scores.EDC, scores.Value, scores.Throw, scores.Flood)
}

func TestComputeScoresWithoutAmazon(t *testing.T) {
	row := SpecRow{
		FlashlightID:     2,
		MaxLumens:        nf(3000),
		MaxCandela:       nf(80000),
		BeamDistanceM:    nf(600),
		RuntimeHighMin:   nf(120),
		WaterproofRating: ns("IP68"),
		PriceUSD:         nf(150),
	}

	scores, _ := computeScores(row, "v2")

	allScores := map[string]float64{
		"overall":  scores.Overall,
		"tactical": scores.Tactical,
		"throw":    scores.Throw,
		"flood":    scores.Flood,
	}

	for name, score := range allScores {
		if score < 0 || score > 100 {
			t.Errorf("%s score out of range [0,100]: %v", name, score)
		}
	}

	t.Logf("No-Amazon scores: overall=%.1f tactical=%.1f edc=%.1f value=%.1f throw=%.1f flood=%.1f",
		scores.Overall, scores.Tactical, scores.EDC, scores.Value, scores.Throw, scores.Flood)
}

func TestHighRatedBudgetLightScoresWell(t *testing.T) {
	budget := SpecRow{
		FlashlightID:      10,
		MaxLumens:         nf(1300),
		MaxCandela:        nf(11000),
		BeamDistanceM:     nf(210),
		RuntimeMediumMin:  nf(120),
		RuntimeHighMin:    nf(72),
		WaterproofRating:  ns("IP67"),
		ImpactResistanceM: nf(1.0),
		PriceUSD:          nf(29.99),
		AmazonAvgRating:   nf(4.4),
		AmazonRatingCount: nf(1500),
	}

	premium := SpecRow{
		FlashlightID:      11,
		MaxLumens:         nf(3100),
		MaxCandela:        nf(80000),
		BeamDistanceM:     nf(500),
		RuntimeHighMin:    nf(90),
		WaterproofRating:  ns("IP68"),
		ImpactResistanceM: nf(1.5),
		PriceUSD:          nf(150),
		AmazonAvgRating:   nf(4.2),
		AmazonRatingCount: nf(200),
	}

	budgetScores, _ := computeScores(budget, "v2")
	premiumScores, _ := computeScores(premium, "v2")

	// Budget light with better reviews should have competitive overall score
	t.Logf("Budget (4.4*, 1500 reviews, $30): overall=%.1f value=%.1f",
		budgetScores.Overall, budgetScores.Value)
	t.Logf("Premium (4.2*, 200 reviews, $150): overall=%.1f value=%.1f",
		premiumScores.Overall, premiumScores.Value)

	if budgetScores.Value <= premiumScores.Value {
		t.Errorf("budget light should have better value score (%.1f) than expensive one (%.1f)",
			budgetScores.Value, premiumScores.Value)
	}
}

func TestTopSellerScoresHigh(t *testing.T) {
	topSeller := SpecRow{
		FlashlightID:      20,
		MaxLumens:         nf(200),
		BeamDistanceM:     nf(100),
		RuntimeHighMin:    nf(45),
		WaterproofRating:  ns("IPX4"),
		PriceUSD:          nf(14.99),
		AmazonAvgRating:   nf(4.6),
		AmazonRatingCount: nf(31000),
	}

	scores, _ := computeScores(topSeller, "v2")

	// A mega-bestseller with 31k reviews and 4.6 stars should have high amazon trust
	// even though its specs are modest
	if scores.Overall < 40 {
		t.Errorf("top-seller with 31k reviews should have decent overall score, got %.1f", scores.Overall)
	}

	t.Logf("Top seller (4.6*, 31k reviews, $15, 200lm): overall=%.1f edc=%.1f value=%.1f",
		scores.Overall, scores.EDC, scores.Value)
}
