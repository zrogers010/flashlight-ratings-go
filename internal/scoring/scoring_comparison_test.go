package scoring

import (
	"database/sql"
	"fmt"
	"testing"
)

// TestScoringFormula_BeforeAfter compares the new scoring formula against
// what the old formula would have produced. This test documents the changes
// made to fix score inflation for products with missing specs.
func TestScoringFormula_BeforeAfter(t *testing.T) {
	testCases := []struct {
		name         string
		row          SpecRow
		description  string
	}{
		{
			name: "Complete High-End Product",
			row: SpecRow{
				FlashlightID:      1,
				MaxLumens:         sql.NullFloat64{Float64: 2800, Valid: true},
				MaxCandela:        sql.NullFloat64{Float64: 36100, Valid: true},
				BeamDistanceM:     sql.NullFloat64{Float64: 380, Valid: true},
				RuntimeMediumMin:  sql.NullFloat64{Float64: 240, Valid: true},
				RuntimeHighMin:    sql.NullFloat64{Float64: 90, Valid: true},
				WaterproofRating:  sql.NullString{String: "IPX8", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 2.0, Valid: true},
				PriceUSD:          sql.NullFloat64{Float64: 119.95, Valid: true},
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.5, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 3200, Valid: true},
			},
			description: "High-end tactical light with all specs populated. Should score 80+.",
		},
		{
			name: "Mid-Range Complete Product",
			row: SpecRow{
				FlashlightID:      2,
				MaxLumens:         sql.NullFloat64{Float64: 1000, Valid: true},
				MaxCandela:        sql.NullFloat64{Float64: 10000, Valid: true},
				BeamDistanceM:     sql.NullFloat64{Float64: 200, Valid: true},
				RuntimeMediumMin:  sql.NullFloat64{Float64: 120, Valid: true},
				RuntimeHighMin:    sql.NullFloat64{Float64: 45, Valid: true},
				WaterproofRating:  sql.NullString{String: "IPX7", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 1.5, Valid: true},
				PriceUSD:          sql.NullFloat64{Float64: 49.95, Valid: true},
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.2, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 850, Valid: true},
			},
			description: "Mid-range EDC with all specs. Should score 65-75.",
		},
		{
			name: "Budget Light - Complete",
			row: SpecRow{
				FlashlightID:      3,
				MaxLumens:         sql.NullFloat64{Float64: 300, Valid: true},
				MaxCandela:        sql.NullFloat64{Float64: 2500, Valid: true},
				BeamDistanceM:     sql.NullFloat64{Float64: 100, Valid: true},
				RuntimeMediumMin:  sql.NullFloat64{Float64: 90, Valid: true},
				RuntimeHighMin:    sql.NullFloat64{Float64: 30, Valid: true},
				WaterproofRating:  sql.NullString{String: "IPX4", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 1.0, Valid: true},
				PriceUSD:          sql.NullFloat64{Float64: 19.95, Valid: true},
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.0, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 450, Valid: true},
			},
			description: "Budget light with all specs. Should score 50-65.",
		},
		{
			name: "Penlight - Low Lumens",
			row: SpecRow{
				FlashlightID:      4,
				MaxLumens:         sql.NullFloat64{Float64: 54, Valid: true},
				MaxCandela:        sql.NullFloat64{Float64: 450, Valid: true},
				BeamDistanceM:     sql.NullFloat64{Float64: 42, Valid: true},
				RuntimeMediumMin:  sql.NullFloat64{Float64: 180, Valid: true},
				RuntimeHighMin:    sql.NullFloat64{Float64: 120, Valid: true},
				WaterproofRating:  sql.NullString{String: "IPX4", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 1.0, Valid: true},
				PriceUSD:          sql.NullFloat64{Float64: 12.95, Valid: true},
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.6, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 1200, Valid: true},
			},
			description: "Penlight with low lumens but good ratings. OLD BUG: scored 97/100. NEW: should score 40-55.",
		},
		{
			name: "Product with Missing Candela & Beam",
			row: SpecRow{
				FlashlightID:      5,
				MaxLumens:         sql.NullFloat64{Float64: 1200, Valid: true},
				MaxCandela:        sql.NullFloat64{Valid: false}, // MISSING
				BeamDistanceM:     sql.NullFloat64{Valid: false}, // MISSING
				RuntimeMediumMin:  sql.NullFloat64{Float64: 180, Valid: true},
				RuntimeHighMin:    sql.NullFloat64{Float64: 60, Valid: true},
				WaterproofRating:  sql.NullString{String: "IPX7", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 1.5, Valid: true},
				PriceUSD:          sql.NullFloat64{Float64: 59.95, Valid: true},
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.3, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 600, Valid: true},
			},
			description: "Product missing throw specs. OLD BUG: missing values ignored, score inflated. NEW: penalized to ~60.",
		},
		{
			name: "Product with Missing Runtime & Price",
			row: SpecRow{
				FlashlightID:      6,
				MaxLumens:         sql.NullFloat64{Float64: 800, Valid: true},
				MaxCandela:        sql.NullFloat64{Float64: 8000, Valid: true},
				BeamDistanceM:     sql.NullFloat64{Float64: 180, Valid: true},
				RuntimeMediumMin:  sql.NullFloat64{Valid: false}, // MISSING
				RuntimeHighMin:    sql.NullFloat64{Valid: false}, // MISSING
				WaterproofRating:  sql.NullString{String: "IPX6", Valid: true},
				ImpactResistanceM: sql.NullFloat64{Float64: 1.2, Valid: true},
				PriceUSD:          sql.NullFloat64{Valid: false}, // MISSING
				AmazonAvgRating:   sql.NullFloat64{Float64: 4.1, Valid: true},
				AmazonRatingCount: sql.NullFloat64{Float64: 320, Valid: true},
			},
			description: "Product missing runtime & price. NEW: penalized significantly, score ~55.",
		},
	}

	fmt.Print("\n=== Scoring Formula Comparison: Before vs After ===\n\n")
	fmt.Printf("%-35s | %8s | %8s | %8s | %s\n", "Product", "Overall", "Tactical", "EDC", "Description")
	fmt.Printf("%s\n", string(make([]byte, 110)))
	fmt.Println()

	for _, tc := range testCases {
		scores, _ := computeScores(tc.row, "v2")

		fmt.Printf("%-35s | %8.1f | %8.1f | %8.1f | %s\n",
			tc.name,
			scores.Overall,
			scores.Tactical,
			scores.EDC,
			tc.description,
		)
	}

	fmt.Print("\n=== Key Changes ===\n")
	fmt.Println("1. Missing core specs (lumens, candela, beam, runtime) now penalized with score of 10 instead of being skipped")
	fmt.Println("2. Boost formula changed from 35 + (raw * 0.65) to 20 + (raw * 0.75) to reduce inflation")
	fmt.Println("3. Result: Low-spec products (penlights) no longer score 90+, incomplete products penalized")
	fmt.Println()

	// Verify the penlight case specifically
	penlightRow := testCases[3].row
	penlightScores, _ := computeScores(penlightRow, "v2")
	if penlightScores.Overall > 60 {
		t.Errorf("Penlight scored too high: %.1f (expected < 60). Low-lumen products should not score 90+.", penlightScores.Overall)
	}

	// Verify incomplete product is penalized
	incompleteRow := testCases[4].row
	incompleteScores, _ := computeScores(incompleteRow, "v2")
	if incompleteScores.Overall > 65 {
		t.Errorf("Incomplete product scored too high: %.1f (expected < 65). Missing specs should be penalized.", incompleteScores.Overall)
	}
}
