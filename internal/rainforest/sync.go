package rainforest

import (
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

// CSV column indices (0-based) matching manual_catalog.csv header.
const (
	colBrandName        = 0
	colASIN             = 10
	colAmazonURL        = 11
	colCurrentPriceUSD  = 12
	colRatingCount      = 13
	colAverageRating    = 14
	colImageURL         = 15
)

type SyncResult struct {
	Total       int
	Updated     int
	Unavailable int
	Errors      int
	Changes     []string
}

// SyncCSV reads the CSV, looks up each ASIN via Rainforest, updates
// price/rating/image fields, and writes the CSV back.
func SyncCSV(ctx context.Context, client *Client, csvPath string, partnerTag string, dryRun bool) (*SyncResult, error) {
	f, err := os.Open(csvPath)
	if err != nil {
		return nil, fmt.Errorf("open csv: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("csv has no data rows")
	}

	result := &SyncResult{Total: len(records) - 1}

	for i := 1; i < len(records); i++ {
		row := records[i]
		asin := strings.TrimSpace(row[colASIN])
		brandName := strings.TrimSpace(row[colBrandName])
		if asin == "" {
			continue
		}

		log.Printf("[%d/%d] Looking up %s %s (ASIN: %s)...", i, result.Total, brandName, strings.TrimSpace(row[5]), asin)

		product, err := client.LookupProduct(ctx, asin)
		if err != nil {
			log.Printf("  ERROR: %v", err)
			result.Errors++
			result.Changes = append(result.Changes, fmt.Sprintf("ERROR  %s (%s): %v", asin, brandName, err))
			continue
		}

		var changes []string

		// Update price
		oldPrice := strings.TrimSpace(row[colCurrentPriceUSD])
		if product.Price > 0 {
			newPrice := formatFloat(product.Price)
			if oldPrice != newPrice {
				changes = append(changes, fmt.Sprintf("price %s -> %s", oldPrice, newPrice))
				row[colCurrentPriceUSD] = newPrice
			}
		} else if !product.InStock {
			changes = append(changes, fmt.Sprintf("UNAVAILABLE (was $%s)", oldPrice))
			result.Unavailable++
		}

		// Update rating count
		oldCount := strings.TrimSpace(row[colRatingCount])
		if product.RatingsTotal > 0 {
			newCount := strconv.Itoa(product.RatingsTotal)
			if oldCount != newCount {
				changes = append(changes, fmt.Sprintf("ratings %s -> %s", oldCount, newCount))
				row[colRatingCount] = newCount
			}
		}

		// Update average rating
		oldRating := strings.TrimSpace(row[colAverageRating])
		if product.Rating > 0 {
			newRating := formatFloat(product.Rating)
			if oldRating != newRating {
				changes = append(changes, fmt.Sprintf("avg_rating %s -> %s", oldRating, newRating))
				row[colAverageRating] = newRating
			}
		}

		// Update amazon_url with current partner tag
		if partnerTag != "" {
			canonicalURL := fmt.Sprintf("https://www.amazon.com/dp/%s?tag=%s", asin, partnerTag)
			if row[colAmazonURL] != canonicalURL {
				row[colAmazonURL] = canonicalURL
			}
		}

		// Report seller info
		seller := product.SellerName
		if product.SoldByAmazon {
			seller = "Amazon.com"
		}
		if seller != "" {
			log.Printf("  Seller: %s | Prime: %v | In Stock: %v", seller, product.IsPrime, product.InStock)
		}

		if len(changes) > 0 {
			result.Updated++
			changeStr := fmt.Sprintf("UPDATED %s %s: %s", brandName, strings.TrimSpace(row[5]), strings.Join(changes, ", "))
			result.Changes = append(result.Changes, changeStr)
			log.Printf("  %s", strings.Join(changes, ", "))
		} else {
			log.Printf("  No changes")
		}

		records[i] = row
	}

	if !dryRun && result.Updated > 0 {
		if err := writeCSV(csvPath, records); err != nil {
			return result, fmt.Errorf("write csv: %w", err)
		}
		log.Printf("Wrote updated CSV to %s", csvPath)
	} else if dryRun && result.Updated > 0 {
		log.Printf("DRY RUN: would have written %d changes to %s", result.Updated, csvPath)
	}

	return result, nil
}

func writeCSV(path string, records [][]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	for _, row := range records {
		if err := w.Write(row); err != nil {
			return err
		}
	}
	w.Flush()
	return w.Error()
}

func formatFloat(v float64) string {
	s := strconv.FormatFloat(v, 'f', 2, 64)
	// Trim trailing zero after decimal for cleaner output (4.50 -> 4.5)
	// but keep at least one decimal place
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
		s = strings.TrimRight(s, ".")
	}
	// If it became empty or just a dash, keep the formatted version
	if s == "" {
		s = "0"
	}
	return s
}

// ExtractASINs returns a set of all ASINs in the CSV (for dedup in discovery).
func ExtractASINs(csvPath string) (map[string]bool, error) {
	f, err := os.Open(csvPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	asins := make(map[string]bool, len(records))
	for i := 1; i < len(records); i++ {
		asin := strings.TrimSpace(records[i][colASIN])
		if asin != "" {
			asins[asin] = true
		}
	}
	return asins, nil
}

// ExtractBrands returns the unique brand names from the CSV.
func ExtractBrands(csvPath string) ([]string, error) {
	f, err := os.Open(csvPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var brands []string
	for i := 1; i < len(records); i++ {
		brand := strings.TrimSpace(records[i][colBrandName])
		if brand != "" && !seen[brand] {
			seen[brand] = true
			brands = append(brands, brand)
		}
	}
	return brands, nil
}
