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
	// State is the post-run sidecar state, returned so the caller can decide
	// whether to invoke pruning, save it, or inspect chronic-unavailable streaks.
	// May be nil when no state path was provided.
	State *SyncState
}

// SyncCSV reads the CSV, looks up each ASIN via Rainforest, updates
// price/rating/image fields, and writes the CSV back. It also loads/updates
// a sidecar JSON state file (StatePathFor(csvPath)) that tracks each ASIN's
// consecutive-unavailable streak so callers can prune chronic-dead listings.
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

	statePath := StatePathFor(csvPath)
	state, err := LoadState(statePath)
	if err != nil {
		return nil, fmt.Errorf("load sync state: %w", err)
	}

	result := &SyncResult{Total: len(records) - 1, State: state}

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

		modelName := strings.TrimSpace(row[5])

		var changes []string

		// Update price + track availability for sidecar state
		oldPrice := strings.TrimSpace(row[colCurrentPriceUSD])
		if product.Price > 0 {
			state.MarkAvailable(asin, brandName, modelName)
			newPrice := formatFloat(product.Price)
			if oldPrice != newPrice {
				changes = append(changes, fmt.Sprintf("price %s -> %s", oldPrice, newPrice))
				row[colCurrentPriceUSD] = newPrice
			}
		} else if !product.InStock {
			state.MarkUnavailable(asin, brandName, modelName, "no price + not in stock")
			streak := state.Entries[asin].UnavailableRuns
			changes = append(changes, fmt.Sprintf("UNAVAILABLE (was $%s) [streak=%d]", oldPrice, streak))
			result.Unavailable++
		} else {
			// In stock but no price returned (e.g. coming-soon / variant-only listing).
			// Treat as available to avoid false positives in prune logic.
			state.MarkAvailable(asin, brandName, modelName)
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

		// Update image_url when (a) it's empty, or (b) it's hosted on a non-Amazon
		// CDN and the API has a stable Amazon-hosted replacement. Manufacturer/
		// 3rd-party CDN paths drift and break over time, so prefer m.media-amazon.com.
		oldImage := strings.TrimSpace(row[colImageURL])
		if product.MainImage != "" && isAmazonHostedImage(product.MainImage) {
			if oldImage == "" {
				changes = append(changes, "image added")
				row[colImageURL] = product.MainImage
			} else if !isAmazonHostedImage(oldImage) {
				changes = append(changes, "image migrated to amazon CDN")
				row[colImageURL] = product.MainImage
			}
		} else if oldImage == "" && product.MainImage != "" {
			// API returned a non-Amazon image but we have nothing — take it anyway.
			changes = append(changes, "image added (non-amazon CDN)")
			row[colImageURL] = product.MainImage
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
			changeStr := fmt.Sprintf("UPDATED %s %s: %s", brandName, modelName, strings.Join(changes, ", "))
			result.Changes = append(result.Changes, changeStr)
			log.Printf("  %s", strings.Join(changes, ", "))
		} else {
			log.Printf("  No changes")
		}

		records[i] = row
	}

	// Garbage-collect stale state entries for ASINs no longer in the CSV.
	keep := make(map[string]bool, len(records))
	for i := 1; i < len(records); i++ {
		if a := strings.TrimSpace(records[i][colASIN]); a != "" {
			keep[a] = true
		}
	}
	if removed := state.GarbageCollect(keep); removed > 0 {
		log.Printf("State: garbage-collected %d entries for ASINs no longer in CSV", removed)
	}

	if !dryRun && result.Updated > 0 {
		if err := writeCSV(csvPath, records); err != nil {
			return result, fmt.Errorf("write csv: %w", err)
		}
		log.Printf("Wrote updated CSV to %s", csvPath)
	} else if dryRun && result.Updated > 0 {
		log.Printf("DRY RUN: would have written %d changes to %s", result.Updated, csvPath)
	}

	if !dryRun {
		if err := state.Save(statePath); err != nil {
			return result, fmt.Errorf("save sync state: %w", err)
		}
		log.Printf("Wrote sync state to %s", statePath)
	} else {
		log.Printf("DRY RUN: would have written sync state to %s", statePath)
	}

	return result, nil
}

// PruneResult summarizes a prune-unavailable run.
type PruneResult struct {
	Threshold int
	Pruned    []PrunedEntry
}

type PrunedEntry struct {
	ASIN  string
	Brand string
	Model string
	Runs  int
}

// PruneUnavailable removes rows whose ASIN has a consecutive-unavailable
// streak >= threshold (per the sidecar state file). It returns the list of
// pruned entries. When dryRun is true, the CSV is not modified.
func PruneUnavailable(csvPath string, threshold int, dryRun bool) (*PruneResult, error) {
	if threshold < 1 {
		return &PruneResult{Threshold: threshold}, nil
	}

	statePath := StatePathFor(csvPath)
	state, err := LoadState(statePath)
	if err != nil {
		return nil, err
	}

	dropASINs := make(map[string]bool)
	for _, asin := range state.ASINsUnavailableFor(threshold) {
		dropASINs[asin] = true
	}
	if len(dropASINs) == 0 {
		return &PruneResult{Threshold: threshold}, nil
	}

	f, err := os.Open(csvPath)
	if err != nil {
		return nil, fmt.Errorf("open csv: %w", err)
	}
	r := csv.NewReader(f)
	r.LazyQuotes = true
	records, err := r.ReadAll()
	f.Close()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("csv has no data rows")
	}

	header := records[0]
	out := [][]string{header}
	res := &PruneResult{Threshold: threshold}
	for i := 1; i < len(records); i++ {
		row := records[i]
		asin := strings.TrimSpace(row[colASIN])
		if asin != "" && dropASINs[asin] {
			e := state.Entries[asin]
			res.Pruned = append(res.Pruned, PrunedEntry{
				ASIN: asin, Brand: row[colBrandName], Model: row[5], Runs: e.UnavailableRuns,
			})
			continue
		}
		out = append(out, row)
	}

	if !dryRun && len(res.Pruned) > 0 {
		if err := writeCSV(csvPath, out); err != nil {
			return res, fmt.Errorf("write pruned csv: %w", err)
		}
		// Drop pruned ASINs from state too so we don't keep tracking them.
		for _, p := range res.Pruned {
			delete(state.Entries, p.ASIN)
		}
		if err := state.Save(statePath); err != nil {
			return res, fmt.Errorf("save sync state after prune: %w", err)
		}
	}

	return res, nil
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

// isAmazonHostedImage reports whether the URL is served from one of Amazon's
// stable image CDNs. Manufacturer/3rd-party CDN URLs (Shopify, Bigcommerce,
// vendor sites) frequently drift and break, so we prefer Amazon-hosted images.
func isAmazonHostedImage(url string) bool {
	if url == "" {
		return false
	}
	lower := strings.ToLower(url)
	for _, host := range []string{
		"m.media-amazon.com",
		"images-na.ssl-images-amazon.com",
		"images-amazon.com",
		"images-eu.ssl-images-amazon.com",
	} {
		if strings.Contains(lower, host) {
			return true
		}
	}
	return false
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
