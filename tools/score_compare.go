package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"flashlight-ratings-go/internal/scoring"
)

type ProductScore struct {
	Brand    string
	Name     string
	Specs    string
	Overall  float64
	Tactical float64
	EDC      float64
	Value    float64
	Throw    float64
	Flood    float64
}

func main() {
	file, err := os.Open("data/manual_catalog.csv")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening CSV: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading CSV: %v\n", err)
		os.Exit(1)
	}

	if len(records) < 2 {
		fmt.Fprintf(os.Stderr, "CSV has no data rows\n")
		os.Exit(1)
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

	var scores []ProductScore
	var zeroScores []ProductScore

	for i, record := range records[1:] {
		if i >= 110 {
			break
		}

		brand := record[brandIdx]
		name := record[nameIdx]
		
		lumens := nullFloat(parseFloat(record[lumensIdx]))
		candela := nullFloat(parseFloat(record[candelaIdx]))
		beam := nullFloat(parseFloat(record[beamIdx]))
		runtime := nullFloat(parseFloat(record[runtimeIdx]))

		// Build spec string
		specParts := []string{}
		if lumens > 0 {
			specParts = append(specParts, fmt.Sprintf("lm=%.0f", lumens))
		}
		if candela > 0 {
			specParts = append(specParts, fmt.Sprintf("cd=%.0f", candela))
		}
		if beam > 0 {
			specParts = append(specParts, fmt.Sprintf("m=%.0f", beam))
		}
		if runtime > 0 {
			specParts = append(specParts, fmt.Sprintf("rt=%.0f", runtime))
		}
		specs := strings.Join(specParts, " ")

		row := scoring.SpecRow{
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

		result, _ := scoring.ComputeScores(row, "v2")

		ps := ProductScore{
			Brand:    brand,
			Name:     name,
			Specs:    specs,
			Overall:  result.Overall,
			Tactical: result.Tactical,
			EDC:      result.EDC,
			Value:    result.Value,
			Throw:    result.Throw,
			Flood:    result.Flood,
		}

		if result.Overall == 0 {
			zeroScores = append(zeroScores, ps)
		} else {
			scores = append(scores, ps)
		}
	}

	// Calculate statistics
	totalProducts := len(scores) + len(zeroScores)
	fmt.Printf("Total products: %d\n", totalProducts)
	fmt.Printf("Scored products: %d\n", len(scores))
	fmt.Printf("Zero-score products (insufficient data): %d\n\n", len(zeroScores))

	if len(scores) > 0 {
		// Calculate min/median/max
		overallScores := make([]float64, len(scores))
		for i, s := range scores {
			overallScores[i] = s.Overall
		}
		sort.Float64s(overallScores)

		min := overallScores[0]
		max := overallScores[len(overallScores)-1]
		median := overallScores[len(overallScores)/2]
		if len(overallScores)%2 == 0 {
			median = (overallScores[len(overallScores)/2-1] + overallScores[len(overallScores)/2]) / 2
		}

		fmt.Printf("Display scores: min=%.1f median=%.1f max=%.1f\n\n", min, median, max)

		// Sort by overall score descending
		sort.Slice(scores, func(i, j int) bool {
			return scores[i].Overall > scores[j].Overall
		})

		// Top 10
		fmt.Println("=== Top 10 Products ===")
		fmt.Printf("%-25s | %-30s | %8s\n", "Brand", "Model", "Overall")
		fmt.Println(strings.Repeat("-", 70))
		for i := 0; i < 10 && i < len(scores); i++ {
			s := scores[i]
			fmt.Printf("%-25s | %-30s | %8.1f\n", truncate(s.Brand, 25), truncate(s.Name, 30), s.Overall)
		}
		fmt.Println()
	}

	// Zero-score products
	if len(zeroScores) > 0 {
		fmt.Printf("=== Zero-Score Products (%d) ===\n", len(zeroScores))
		fmt.Printf("%-25s | %-30s | %-40s\n", "Brand", "Model", "Specs Available")
		fmt.Println(strings.Repeat("-", 100))
		for _, s := range zeroScores {
			specStr := s.Specs
			if specStr == "" {
				specStr = "(none)"
			}
			fmt.Printf("%-25s | %-30s | %-40s\n", truncate(s.Brand, 25), truncate(s.Name, 30), specStr)
		}
	}
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

func nullFloat(v sql.NullFloat64) float64 {
	if !v.Valid {
		return 0
	}
	return v.Float64
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
