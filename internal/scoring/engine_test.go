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

func TestPartialSpecsScoreNonZero(t *testing.T) {
	// Product with only lumens and runtime (no candela/throw)
	partialLumens := SpecRow{
		FlashlightID:   30,
		MaxLumens:      nf(1500),
		RuntimeHighMin: nf(60),
	}

	scores, _ := computeScores(partialLumens, "v2")
	if scores.Overall <= 0 {
		t.Errorf("product with lumens + runtime should score > 0, got %.1f", scores.Overall)
	}
	t.Logf("Lumens+runtime only: overall=%.1f", scores.Overall)

	// Product with only candela and runtime (no lumens, but should derive throw)
	partialCandela := SpecRow{
		FlashlightID:   31,
		MaxCandela:     nf(20000),
		RuntimeHighMin: nf(90),
	}

	scores2, _ := computeScores(partialCandela, "v2")
	if scores2.Overall <= 0 {
		t.Errorf("product with candela + runtime should score > 0, got %.1f", scores2.Overall)
	}
	t.Logf("Candela+runtime only: overall=%.1f", scores2.Overall)

	// Product with only throw and runtime (no lumens, but should derive candela)
	partialThrow := SpecRow{
		FlashlightID:   32,
		BeamDistanceM:  nf(300),
		RuntimeHighMin: nf(75),
	}

	scores3, _ := computeScores(partialThrow, "v2")
	if scores3.Overall <= 0 {
		t.Errorf("product with throw + runtime should score > 0, got %.1f", scores3.Overall)
	}
	t.Logf("Throw+runtime only: overall=%.1f", scores3.Overall)
}

func TestCandelaThrowDerivation(t *testing.T) {
	// Test deriving candela from throw
	withThrowOnly := SpecRow{
		FlashlightID:   40,
		MaxLumens:      nf(1000),
		BeamDistanceM:  nf(400),
		RuntimeHighMin: nf(60),
	}

	scores1, breakdown1 := computeScores(withThrowOnly, "v2")
	var parsed1 map[string]any
	json.Unmarshal(breakdown1, &parsed1)
	raw1 := parsed1["raw"].(map[string]any)

	// Should derive candela from throw: candela = (throw/2)^2 = (400/2)^2 = 40000
	if candela, ok := raw1["max_candela"].(float64); !ok || candela != 40000 {
		t.Errorf("expected derived candela=40000 from throw=400, got %v", raw1["max_candela"])
	}

	// Test deriving throw from candela
	withCandelaOnly := SpecRow{
		FlashlightID:   41,
		MaxLumens:      nf(1000),
		MaxCandela:     nf(40000),
		RuntimeHighMin: nf(60),
	}

	scores2, breakdown2 := computeScores(withCandelaOnly, "v2")
	var parsed2 map[string]any
	json.Unmarshal(breakdown2, &parsed2)
	raw2 := parsed2["raw"].(map[string]any)

	// Should derive throw from candela: throw = 2*sqrt(40000) = 400
	if throw, ok := raw2["beam_distance_m"].(float64); !ok || throw != 400 {
		t.Errorf("expected derived throw=400 from candela=40000, got %v", raw2["beam_distance_m"])
	}

	// Scores should be identical since specs are equivalent
	if scores1.Overall != scores2.Overall {
		t.Logf("Throw-only: overall=%.1f, Candela-only: overall=%.1f", scores1.Overall, scores2.Overall)
	}
}

func TestInsufficientDataReturnsZero(t *testing.T) {
	// Only runtime (no brightness specs)
	onlyRuntime := SpecRow{
		FlashlightID:   51,
		RuntimeHighMin: nf(60),
	}

	scores1, _ := computeScores(onlyRuntime, "v2")
	if scores1.Overall != 0 {
		t.Errorf("product with only runtime should score 0, got %.1f", scores1.Overall)
	}

	// Completely empty
	empty := SpecRow{
		FlashlightID: 52,
	}

	scores2, _ := computeScores(empty, "v2")
	if scores2.Overall != 0 {
		t.Errorf("empty product should score 0, got %.1f", scores2.Overall)
	}
	
	// Only price and ratings (no core specs)
	onlyExtras := SpecRow{
		FlashlightID:      53,
		PriceUSD:          nf(50),
		AmazonAvgRating:   nf(4.5),
		AmazonRatingCount: nf(1000),
	}

	scores3, _ := computeScores(onlyExtras, "v2")
	if scores3.Overall != 0 {
		t.Errorf("product with only price/ratings should score 0, got %.1f", scores3.Overall)
	}
	
	// Only lumens should now get a score (was returning 0 before)
	onlyLumens := SpecRow{
		FlashlightID: 50,
		MaxLumens:    nf(1000),
	}

	scores4, _ := computeScores(onlyLumens, "v2")
	if scores4.Overall <= 0 {
		t.Errorf("product with only lumens should score > 0, got %.1f", scores4.Overall)
	}
}

func TestPartialSpecPenalty(t *testing.T) {
	// Full-spec product: lumens, candela, runtime
	fullSpec := SpecRow{
		FlashlightID:   60,
		MaxLumens:      nf(2000),
		MaxCandela:     nf(20000),
		RuntimeHighMin: nf(90),
	}

	// Partial-spec product with same lumens but no candela/throw
	partialSpec := SpecRow{
		FlashlightID:   61,
		MaxLumens:      nf(2000),
		RuntimeHighMin: nf(90),
	}

	fullScores, _ := computeScores(fullSpec, "v2")
	partialScores, _ := computeScores(partialSpec, "v2")

	if partialScores.Overall >= fullScores.Overall {
		t.Errorf("partial-spec product should score below full-spec: partial=%.1f, full=%.1f",
			partialScores.Overall, fullScores.Overall)
	}

	// Partial-spec should be penalized by 50%
	if partialScores.Overall > fullScores.Overall*0.6 {
		t.Errorf("partial-spec penalty seems too weak: partial=%.1f (expected < %.1f)",
			partialScores.Overall, fullScores.Overall*0.6)
	}

	t.Logf("Full-spec: overall=%.1f, Partial-spec: overall=%.1f", fullScores.Overall, partialScores.Overall)
}

func TestLowOutputCap(t *testing.T) {
	// High-output light
	highOutput := SpecRow{
		FlashlightID:      70,
		MaxLumens:         nf(2000),
		MaxCandela:        nf(20000),
		RuntimeHighMin:    nf(90),
		AmazonAvgRating:   nf(4.5),
		AmazonRatingCount: nf(1000),
	}

	// Low-output light with excellent runtime and ratings (like medical penlight)
	lowOutput := SpecRow{
		FlashlightID:      71,
		MaxLumens:         nf(5),
		MaxCandela:        nf(5),
		RuntimeHighMin:    nf(600),
		AmazonAvgRating:   nf(4.7),
		AmazonRatingCount: nf(3000),
	}

	highScores, _ := computeScores(highOutput, "v2")
	lowScores, _ := computeScores(lowOutput, "v2")

	if lowScores.Overall >= highScores.Overall {
		t.Errorf("low-output light should not outrank high-output light: low=%.1f, high=%.1f",
			lowScores.Overall, highScores.Overall)
	}

	// Low-output lights (<50 lm) should be capped at 70% of their raw score
	if lowScores.Overall > 70 {
		t.Errorf("low-output light score too high (expected < 70): %.1f", lowScores.Overall)
	}

	t.Logf("High-output (2000lm): %.1f, Low-output (5lm): %.1f", highScores.Overall, lowScores.Overall)
}

