package scoring

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
)

// TestScoringFormula_RealCatalog runs computeScores on all products from manual_catalog.csv
// and verifies the scores are believable.
func TestScoringFormula_RealCatalog(t *testing.T) {
	file, err := os.Open("../../data/manual_catalog.csv")
	if err != nil {
		t.Skipf("Skipping real catalog test: %v", err)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("Failed to read CSV: %v", err)
	}

	if len(records) < 2 {
		t.Fatal("CSV has no data rows")
	}

	// Parse header
	header := records[0]
	brandIdx := indexOf(header, "brand_name")
	nameIdx := indexOf(header, "model_name")
	lumensIdx := indexOf(header, "max_lumens")
	candelaIdx := indexOf(header, "max_candela")
	beamIdx := indexOf(header, "beam_distance_m")
	runtimeIdx := indexOf(header, "runtime_max_min")
	ipIdx := indexOf(header, "waterproof_rating")
	impactIdx := indexOf(header, "impact_resistance_m")
	priceIdx := indexOf(header, "current_price_usd")
	ratingIdx := indexOf(header, "amazon_average_rating")
	countIdx := indexOf(header, "amazon_rating_count")

	type result struct {
		brand    string
		name     string
		lumens   float64
		beam     float64
		overall  float64
		tactical float64
		edc      float64
	}

	var results []result
	insufficientCount := 0

	for i, record := range records[1:] {
		if i >= 110 { // Limit to first 110 rows
			break
		}

		brand := record[brandIdx]
		name := record[nameIdx]

		row := SpecRow{
			FlashlightID:      int64(i + 1),
			MaxLumens:         parseFloat(record[lumensIdx]),
			MaxCandela:        parseFloat(record[candelaIdx]),
			BeamDistanceM:     parseFloat(record[beamIdx]),
			RuntimeHighMin:    parseFloat(record[runtimeIdx]),
			WaterproofRating:  sql.NullString{String: record[ipIdx], Valid: record[ipIdx] != ""},
			ImpactResistanceM: parseFloat(record[impactIdx]),
			PriceUSD:          parseFloat(record[priceIdx]),
			AmazonAvgRating:   parseFloat(record[ratingIdx]),
			AmazonRatingCount: parseFloat(record[countIdx]),
		}

		scores, _ := computeScores(row, "v2")

		// Insufficient data returns all zeros
		if scores.Overall == 0 && scores.Tactical == 0 && scores.EDC == 0 {
			insufficientCount++
			continue
		}

		results = append(results, result{
			brand:    brand,
			name:     name,
			lumens:   nullFloat(row.MaxLumens),
			beam:     nullFloat(row.BeamDistanceM),
			overall:  scores.Overall,
			tactical: scores.Tactical,
			edc:      scores.EDC,
		})
	}

	// Calculate statistics
	if len(results) == 0 {
		t.Fatal("No products with sufficient data")
	}

	var sumOverall, sumTactical, sumEDC float64
	var maxOverall, maxTactical, maxEDC float64
	var minOverall, minTactical, minEDC float64 = 100, 100, 100

	for _, r := range results {
		sumOverall += r.overall
		sumTactical += r.tactical
		sumEDC += r.edc

		if r.overall > maxOverall {
			maxOverall = r.overall
		}
		if r.overall < minOverall {
			minOverall = r.overall
		}
		if r.tactical > maxTactical {
			maxTactical = r.tactical
		}
		if r.tactical < minTactical {
			minTactical = r.tactical
		}
		if r.edc > maxEDC {
			maxEDC = r.edc
		}
		if r.edc < minEDC {
			minEDC = r.edc
		}
	}

	avgOverall := sumOverall / float64(len(results))
	avgTactical := sumTactical / float64(len(results))
	avgEDC := sumEDC / float64(len(results))

	// Print statistics
	fmt.Printf("\n=== Real Catalog Scoring Results (%d products, %d insufficient data) ===\n\n", len(results), insufficientCount)
	fmt.Printf("Overall Score: avg=%.1f min=%.1f max=%.1f\n", avgOverall, minOverall, maxOverall)
	fmt.Printf("Tactical Score: avg=%.1f min=%.1f max=%.1f\n", avgTactical, minTactical, maxTactical)
	fmt.Printf("EDC Score: avg=%.1f min=%.1f max=%.1f\n\n", avgEDC, minEDC, maxEDC)

	// Print top 10 and bottom 5
	fmt.Println("=== Top 10 Products ===")
	sortByOverall := make([]result, len(results))
	copy(sortByOverall, results)
	// Simple bubble sort for top 10
	for i := 0; i < len(sortByOverall); i++ {
		for j := i + 1; j < len(sortByOverall); j++ {
			if sortByOverall[j].overall > sortByOverall[i].overall {
				sortByOverall[i], sortByOverall[j] = sortByOverall[j], sortByOverall[i]
			}
		}
	}

	fmt.Printf("%-25s | %8s | %8s | %8s | %8s\n", "Product", "Lumens", "Beam", "Overall", "Tactical")
	fmt.Println(strings.Repeat("-", 75))
	for i := 0; i < 10 && i < len(sortByOverall); i++ {
		r := sortByOverall[i]
		fmt.Printf("%-25s | %8.0f | %8.0f | %8.1f | %8.1f\n",
			truncateStr(r.brand+" "+r.name, 25),
			r.lumens, r.beam, r.overall, r.tactical)
	}

	fmt.Println("\n=== Bottom 5 Products ===")
	fmt.Printf("%-25s | %8s | %8s | %8s | %8s\n", "Product", "Lumens", "Beam", "Overall", "Tactical")
	fmt.Println(strings.Repeat("-", 75))
	start := len(sortByOverall) - 5
	if start < 0 {
		start = 0
	}
	for i := start; i < len(sortByOverall); i++ {
		r := sortByOverall[i]
		fmt.Printf("%-25s | %8.0f | %8.0f | %8.1f | %8.1f\n",
			truncateStr(r.brand+" "+r.name, 25),
			r.lumens, r.beam, r.overall, r.tactical)
	}
	fmt.Println()

	// Specific product checks
	var thruNite *result
	for i := range results {
		if strings.Contains(strings.ToLower(results[i].brand), "thrunite") &&
			strings.Contains(strings.ToLower(results[i].name), "catapult") {
			thruNite = &results[i]
		}
	}

	// Assertions
	t.Run("Average scores reasonable", func(t *testing.T) {
		// With 12% partial-spec penalty and low-output caps, average will be higher than 50%
		if avgOverall < 55 || avgOverall > 75 {
			t.Errorf("Average overall score %.1f out of reasonable range (expected 55-75)", avgOverall)
		}
	})

	t.Run("Top products score high", func(t *testing.T) {
		if maxOverall < 80 {
			t.Errorf("Top product scores %.1f, expected >= 80", maxOverall)
		}
	})

	t.Run("Top lights in reasonable range", func(t *testing.T) {
		if thruNite != nil {
			if thruNite.overall < 75 || thruNite.overall > 85 {
				t.Errorf("ThruNite Catapult scores %.1f, expected 75-85 range", thruNite.overall)
			}
			fmt.Printf("✓ ThruNite Catapult: overall=%.1f tactical=%.1f\n", thruNite.overall, thruNite.tactical)
		}
	})
}

func indexOf(slice []string, value string) int {
	for i, v := range slice {
		if v == value {
			return i
		}
	}
	return -1
}

func parseFloat(s string) sql.NullFloat64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return sql.NullFloat64{Valid: false}
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return sql.NullFloat64{Valid: false}
	}
	return sql.NullFloat64{Float64: f, Valid: true}
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
