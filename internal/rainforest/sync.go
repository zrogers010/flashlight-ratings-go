package rainforest

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// CSV column indices (0-based) matching manual_catalog.csv header.
const (
	colBrandName         = 0
	colASIN              = 10
	colAmazonURL         = 11
	colCurrentPriceUSD   = 12
	colRatingCount       = 13
	colAverageRating     = 14
	colImageURL          = 15
	colAmazonPurchasable = 36
	colAmazonCheckedAt   = 37
)

type SyncResult struct {
	Total       int // rows considered (after slice/rotation filtering)
	Skipped     int // rows skipped due to slice/rotation
	Updated     int
	Unavailable int
	Errors      int
	Changes     []string
	// State is the post-run sidecar state, returned for inspection of
	// chronic-unavailable streaks.
	// May be nil when no state path was provided.
	State *SyncState
}

// SyncOptions controls how SyncCSV processes rows. Zero value = process every
// row (legacy behavior). Slice/rotation options let callers refresh only a
// subset per run, which is how the daily-rotation cron stays under Rainforest
// usage limits.
type SyncOptions struct {
	PartnerTag string
	DryRun     bool
	// AvailabilityThreshold is the number of consecutive non-purchasable
	// responses required before the Amazon offer is soft-disabled. A later
	// purchasable response re-enables it automatically.
	AvailabilityThreshold int

	// RotateDays > 0 enables auto-rotation: the catalog is sharded into
	// RotateDays groups by row index, and only the shard for "today" (based
	// on UTC day-of-year) is processed. With RotateDays=7 a 110-row catalog
	// touches ~16 ASINs per daily run and every ASIN is refreshed once a week.
	// Mutually exclusive with Limit/Offset (RotateDays takes precedence).
	RotateDays int

	// Limit / Offset give explicit slice control. When Limit > 0, only rows
	// with index in [Offset, Offset+Limit) (0-based, excluding header) are
	// processed. Useful for one-off batch refreshes.
	Limit  int
	Offset int

	// Now lets tests inject a deterministic time for rotation. Defaults to
	// time.Now when nil.
	Now func() time.Time
}

// SyncCSV reads the CSV, looks up each ASIN via Rainforest, updates
// price/rating/image fields, and writes the CSV back. It also loads/updates
// a sidecar JSON state file (StatePathFor(csvPath)) that tracks each ASIN's
// consecutive-unavailable streak so offers can be soft-disabled and recovered.
//
// Deprecated: prefer SyncCSVWithSources for new callers. This wrapper preserves
// the original 5-arg signature for tests / older entrypoints.
func SyncCSV(ctx context.Context, client *Client, csvPath string, partnerTag string, dryRun bool) (*SyncResult, error) {
	return SyncCSVWithOptions(ctx, client, csvPath, SyncOptions{
		PartnerTag: partnerTag,
		DryRun:     dryRun,
	})
}

// SyncCSVWithOptions runs a Rainforest-only sync (legacy entrypoint).
func SyncCSVWithOptions(ctx context.Context, client *Client, csvPath string, opts SyncOptions) (*SyncResult, error) {
	return SyncCSVWithSources(ctx, Sources{Primary: client}, csvPath, opts)
}

// SyncCSVWithSources is the slice/rotation-aware, multi-source entrypoint.
// The primary source provides offer/image data; when it reports
// ErrSourceUnavailable the run transparently continues on the fallback.
// When the primary result carries no ratings (e.g. Creators API accounts
// without customerReviews access) and RatingsFrom is configured, ratings are
// reinforced with one extra lookup per row.
func SyncCSVWithSources(ctx context.Context, src Sources, csvPath string, opts SyncOptions) (*SyncResult, error) {
	if src.Primary == nil {
		return nil, fmt.Errorf("sync: primary product source is required")
	}
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
	ensureAvailabilityColumns(records)

	statePath := StatePathFor(csvPath)
	state, err := LoadState(statePath)
	if err != nil {
		return nil, fmt.Errorf("load sync state: %w", err)
	}

	dataRowCount := len(records) - 1
	selector := newRowSelector(opts, dataRowCount)
	if selector.label != "" {
		log.Printf("Slice: %s (%d/%d rows will be processed)", selector.label, selector.selectedCount, dataRowCount)
	}

	result := &SyncResult{State: state}

	// Warm batchable sources (Creators API getItems takes 10 ASINs/call)
	// with everything this run will touch. A source-level failure here flips
	// the whole run to the fallback before we start mutating rows.
	usingFallback := false
	var selectedASINs []string
	for i := 1; i < len(records); i++ {
		asin := strings.TrimSpace(records[i][colASIN])
		if asin != "" && selector.includes(i-1) {
			selectedASINs = append(selectedASINs, asin)
		}
	}
	if bp, ok := src.Primary.(BatchPreloader); ok && len(selectedASINs) > 0 {
		if err := bp.Preload(ctx, selectedASINs); err != nil {
			if errors.Is(err, ErrSourceUnavailable) && src.Fallback != nil {
				log.Printf("WARNING: %s unavailable (%v) — failing over to %s for this run",
					src.Primary.SourceName(), err, src.Fallback.SourceName())
				usingFallback = true
			} else {
				return nil, fmt.Errorf("preload %s: %w", src.Primary.SourceName(), err)
			}
		}
	}

	lookupOne := func(asin string) (*ProductResult, string, error) {
		if !usingFallback {
			product, err := src.Primary.LookupProduct(ctx, asin)
			switch {
			case err == nil:
				return product, src.Primary.SourceName(), nil
			case errors.Is(err, ErrItemNotFound):
				// The source answered but doesn't know this ASIN: strong
				// evidence the listing is gone. Feed the unavailable-streak
				// logic instead of counting an error.
				return &ProductResult{}, src.Primary.SourceName(), nil
			case errors.Is(err, ErrSourceUnavailable) && src.Fallback != nil:
				log.Printf("WARNING: %s unavailable (%v) — failing over to %s for the rest of the run",
					src.Primary.SourceName(), err, src.Fallback.SourceName())
				usingFallback = true
			default:
				return nil, src.Primary.SourceName(), err
			}
		}
		if usingFallback {
			product, err := src.Fallback.LookupProduct(ctx, asin)
			return product, src.Fallback.SourceName(), err
		}
		return nil, src.Primary.SourceName(), fmt.Errorf("no source available for %s", asin)
	}

	for i := 1; i < len(records); i++ {
		row := records[i]
		asin := strings.TrimSpace(row[colASIN])
		brandName := strings.TrimSpace(row[colBrandName])
		if asin == "" {
			continue
		}

		if !selector.includes(i - 1) {
			result.Skipped++
			continue
		}
		result.Total++

		log.Printf("[%d/%d] Looking up %s %s (ASIN: %s)...", i, dataRowCount, brandName, strings.TrimSpace(row[5]), asin)

		product, sourceName, err := lookupOne(asin)
		if err != nil {
			log.Printf("  ERROR (%s): %v", sourceName, err)
			result.Errors++
			result.Changes = append(result.Changes, fmt.Sprintf("ERROR  %s (%s): %v", asin, brandName, err))
			continue
		}

		modelName := strings.TrimSpace(row[5])

		var changes []string

		// Reinforce ratings from the secondary source when the primary
		// carries none, and sanity-check availability across the two.
		if src.RatingsFrom != nil && !usingFallback &&
			product.Rating == 0 && product.RatingsTotal == 0 {
			rp, rerr := src.RatingsFrom.LookupProduct(ctx, asin)
			if rerr != nil {
				log.Printf("  ratings lookup via %s failed: %v", src.RatingsFrom.SourceName(), rerr)
			} else {
				product.Rating = rp.Rating
				product.RatingsTotal = rp.RatingsTotal
				if rp.InStock != product.InStock {
					msg := fmt.Sprintf("MISMATCH %s %s: %s in_stock=%v vs %s in_stock=%v (%s wins)",
						brandName, modelName,
						sourceName, product.InStock,
						src.RatingsFrom.SourceName(), rp.InStock,
						sourceName)
					log.Printf("  %s", msg)
					result.Changes = append(result.Changes, msg)
				}
			}
		}

		offerChanges, unavailable := updateOfferState(
			row, state, asin, brandName, modelName, product, opts.AvailabilityThreshold,
		)
		changes = append(changes, offerChanges...)
		if unavailable {
			result.Unavailable++
		}
		row[colAmazonCheckedAt] = syncNow(opts).Format(time.RFC3339)

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

		// Track the listing's current primary image. Amazon retires old CDN
		// paths when sellers swap photos, so a pinned URL eventually 404s;
		// always adopt the Amazon-hosted image the source reports today.
		// Non-Amazon (manufacturer/Shopify) URLs are only used to fill gaps.
		oldImage := strings.TrimSpace(row[colImageURL])
		newImage := strings.TrimSpace(product.MainImage)
		if isPlaceholderImage(newImage) {
			newImage = ""
		}
		if newImage != "" && isAmazonHostedImage(newImage) {
			if oldImage == "" {
				changes = append(changes, "image added")
				row[colImageURL] = newImage
			} else if oldImage != newImage {
				changes = append(changes, "image refreshed")
				row[colImageURL] = newImage
			}
		} else if oldImage == "" && newImage != "" {
			// API returned a non-Amazon image but we have nothing — take it anyway.
			changes = append(changes, "image added (non-amazon CDN)")
			row[colImageURL] = newImage
		}

		if opts.PartnerTag != "" {
			canonicalURL := fmt.Sprintf("https://www.amazon.com/dp/%s?tag=%s", asin, opts.PartnerTag)
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

	// Every processed row receives a fresh availability timestamp, even when
	// price and rating values are unchanged.
	if !opts.DryRun && result.Total > 0 {
		if err := writeCSV(csvPath, records); err != nil {
			return result, fmt.Errorf("write csv: %w", err)
		}
		log.Printf("Wrote updated CSV to %s", csvPath)
	} else if opts.DryRun && result.Total > 0 {
		log.Printf("DRY RUN: would have refreshed %d rows in %s", result.Total, csvPath)
	}

	if !opts.DryRun {
		if err := state.Save(statePath); err != nil {
			return result, fmt.Errorf("save sync state: %w", err)
		}
		log.Printf("Wrote sync state to %s", statePath)
	} else {
		log.Printf("DRY RUN: would have written sync state to %s", statePath)
	}

	return result, nil
}

// rowSelector encapsulates the slice/rotation predicate so SyncCSVWithOptions
// can decide row-by-row whether to spend an API credit. Index is 0-based over
// data rows (header excluded).
type rowSelector struct {
	includes      func(idx int) bool
	selectedCount int
	label         string
}

func newRowSelector(opts SyncOptions, dataRowCount int) rowSelector {
	if dataRowCount <= 0 {
		return rowSelector{includes: func(int) bool { return true }}
	}

	if opts.RotateDays > 1 {
		now := time.Now
		if opts.Now != nil {
			now = opts.Now
		}
		shard := (now().UTC().YearDay() - 1) % opts.RotateDays
		count := 0
		for i := 0; i < dataRowCount; i++ {
			if i%opts.RotateDays == shard {
				count++
			}
		}
		return rowSelector{
			includes: func(idx int) bool {
				return idx%opts.RotateDays == shard
			},
			selectedCount: count,
			label: fmt.Sprintf("rotate-days=%d shard=%d/%d (UTC day-of-year)",
				opts.RotateDays, shard, opts.RotateDays),
		}
	}

	if opts.Limit > 0 {
		start := opts.Offset
		if start < 0 {
			start = 0
		}
		end := start + opts.Limit
		if end > dataRowCount {
			end = dataRowCount
		}
		count := end - start
		if count < 0 {
			count = 0
		}
		return rowSelector{
			includes:      func(idx int) bool { return idx >= start && idx < end },
			selectedCount: count,
			label:         fmt.Sprintf("limit=%d offset=%d", opts.Limit, opts.Offset),
		}
	}

	return rowSelector{
		includes:      func(int) bool { return true },
		selectedCount: dataRowCount,
	}
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

func ensureAvailabilityColumns(records [][]string) {
	if len(records) == 0 {
		return
	}
	for len(records[0]) <= colAmazonPurchasable {
		records[0] = append(records[0], "")
	}
	records[0][colAmazonPurchasable] = "amazon_purchasable"
	for len(records[0]) <= colAmazonCheckedAt {
		records[0] = append(records[0], "")
	}
	records[0][colAmazonCheckedAt] = "amazon_availability_checked_at"

	for i := 1; i < len(records); i++ {
		for len(records[i]) <= colAmazonCheckedAt {
			records[i] = append(records[i], "")
		}
		if strings.TrimSpace(records[i][colAmazonPurchasable]) == "" {
			// Existing catalogs predate availability tracking. Preserve their
			// current links until Rainforest supplies repeated contrary evidence.
			records[i][colAmazonPurchasable] = "true"
		}
	}
}

func updateOfferState(
	row []string,
	state *SyncState,
	asin, brandName, modelName string,
	product *ProductResult,
	threshold int,
) ([]string, bool) {
	// A usable offer needs both a positive buy-box price and an explicit
	// in-stock signal. Prime and seller identity are informational only:
	// legitimate third-party offers remain eligible.
	oldPrice := strings.TrimSpace(row[colCurrentPriceUSD])
	if strings.EqualFold(strings.TrimSpace(product.ASIN), strings.TrimSpace(asin)) &&
		product.Price > 0 &&
		product.InStock {
		state.MarkAvailable(asin, brandName, modelName)
		var changes []string
		newPrice := formatFloat(product.Price)
		if oldPrice != newPrice {
			changes = append(changes, fmt.Sprintf("price %s -> %s", oldPrice, newPrice))
			row[colCurrentPriceUSD] = newPrice
		}
		if row[colAmazonPurchasable] != "true" {
			changes = append(changes, "Amazon offer re-enabled")
			row[colAmazonPurchasable] = "true"
		}
		return changes, false
	}

	state.MarkUnavailable(asin, brandName, modelName, "no purchasable buy box")
	streak := state.Entries[asin].UnavailableRuns
	changes := []string{
		fmt.Sprintf("UNAVAILABLE (was $%s) [streak=%d]", oldPrice, streak),
	}
	if threshold > 0 && streak >= threshold && row[colAmazonPurchasable] != "false" {
		changes = append(changes, "Amazon offer soft-disabled")
		row[colAmazonPurchasable] = "false"
	}
	return changes, true
}

func syncNow(opts SyncOptions) time.Time {
	if opts.Now != nil {
		return opts.Now().UTC()
	}
	return time.Now().UTC()
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

// isPlaceholderImage reports whether the URL is Amazon's "no image available"
// placeholder. The frontend already treats these as broken; never write them
// into the catalog.
func isPlaceholderImage(url string) bool {
	return strings.Contains(url, "._SCLZZZZZZZ_")
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
