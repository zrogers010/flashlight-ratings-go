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

type productInfo struct {
	brand      string
	model      string
	lumens     string
	beam       string
	runtime    string
	score      float64
	isFullSpec bool
}

func main() {
	file, err := os.Open("data/manual_catalog.csv")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

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

	var products []productInfo

	for i, record := range records[1:] {
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

		scores, _ := scoring.ComputeScores(row, "v2")

		if scores.Overall > 0 {
			hasLumens := row.MaxLumens.Valid && row.MaxLumens.Float64 > 0
			hasCandela := row.MaxCandela.Valid && row.MaxCandela.Float64 > 0
			hasBeam := row.BeamDistanceM.Valid && row.BeamDistanceM.Float64 > 0
			hasRuntime := row.RuntimeHighMin.Valid && row.RuntimeHighMin.Float64 > 0
			isFullSpec := hasLumens && (hasCandela || hasBeam) && hasRuntime

			products = append(products, productInfo{
				brand:      record[brandIdx],
				model:      record[nameIdx],
				lumens:     record[lumensIdx],
				beam:       record[beamIdx],
				runtime:    record[runtimeIdx],
				score:      scores.Overall,
				isFullSpec: isFullSpec,
			})
		}
	}

	sort.Slice(products, func(i, j int) bool {
		return products[i].score > products[j].score
	})

	fmt.Println("=== Top 10 Products ===")
	fmt.Printf("%-3s | %-25s | %-30s | %8s | %8s | %8s | %8s | %s\n",
		"#", "Brand", "Model", "Overall", "Lumens", "Beam", "Runtime", "Spec")
	fmt.Println(strings.Repeat("-", 130))

	for i := 0; i < 10 && i < len(products); i++ {
		p := products[i]
		specStatus := "Full"
		if !p.isFullSpec {
			specStatus = "Partial"
		}
		fmt.Printf("%-3d | %-25s | %-30s | %8.1f | %8s | %8s | %8s | %s\n",
			i+1, p.brand, p.model, p.score, p.lumens, p.beam+"m", p.runtime+"min", specStatus)
	}

	// Find highest-ranked partial-spec product
	fmt.Println("\n=== Highest-Ranked Partial-Spec Product ===")
	for i, p := range products {
		if !p.isFullSpec {
			fmt.Printf("Rank #%d: %s %s (%.1f)\n", i+1, p.brand, p.model, p.score)
			fmt.Printf("  Lumens: %s, Beam: %s, Runtime: %s\n", p.lumens, p.beam+"m", p.runtime+"min")
			break
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
