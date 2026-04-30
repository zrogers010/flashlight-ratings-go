package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"flashlight-ratings-go/internal/rainforest"
)

func main() {
	csvPath := flag.String("f", "data/manual_catalog.csv", "path to manual catalog CSV")
	mode := flag.String("mode", "both", "run mode: update, discover, or both")
	delay := flag.Duration("delay", 1*time.Second, "delay between API requests")
	dryRun := flag.Bool("dry-run", false, "print changes without writing CSV")
	maxPerBrand := flag.Int("max-per-brand", 10, "max search results per brand in discover mode")
	pruneUnavailable := flag.Int("prune-unavailable", 0, "after update, remove rows whose ASIN has been UNAVAILABLE for >= N consecutive sync runs (0 = never prune)")
	rotateDays := flag.Int("rotate-days", envInt("SYNC_ROTATE_DAYS", 0), "shard the catalog into N daily slices (e.g. 7 = touch ~1/7th of ASINs per run, full coverage every N days). 0 disables rotation.")
	limit := flag.Int("limit", envInt("SYNC_LIMIT", 0), "process at most N rows in update mode (0 = all). Ignored when -rotate-days is set.")
	offset := flag.Int("offset", envInt("SYNC_OFFSET", 0), "skip the first N rows in update mode. Ignored when -rotate-days is set.")
	flag.Parse()

	apiKey := os.Getenv("RAINFOREST_API_KEY")
	if apiKey == "" {
		log.Fatal("RAINFOREST_API_KEY is required")
	}

	partnerTag := envOr("AMAZON_PARTNER_TAG", "flashlightrat-20")

	*mode = strings.ToLower(strings.TrimSpace(*mode))
	if *mode != "update" && *mode != "discover" && *mode != "both" {
		log.Fatalf("invalid mode %q: must be update, discover, or both", *mode)
	}

	client := rainforest.NewClient(apiKey, *delay)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	if *mode == "update" || *mode == "both" {
		runUpdate(ctx, client, *csvPath, rainforest.SyncOptions{
			PartnerTag: partnerTag,
			DryRun:     *dryRun,
			RotateDays: *rotateDays,
			Limit:      *limit,
			Offset:     *offset,
		})
	}

	if *pruneUnavailable > 0 {
		runPrune(*csvPath, *pruneUnavailable, *dryRun)
	}

	if *mode == "discover" || *mode == "both" {
		runDiscover(ctx, client, *csvPath, *maxPerBrand)
	}
}

func runPrune(csvPath string, threshold int, dryRun bool) {
	log.Println("=== PRUNE: Removing chronically-unavailable listings ===")

	res, err := rainforest.PruneUnavailable(csvPath, threshold, dryRun)
	if err != nil {
		log.Fatalf("prune failed: %v", err)
	}

	fmt.Println()
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("PRUNE SUMMARY: %d listing(s) unavailable for >= %d consecutive sync runs\n",
		len(res.Pruned), threshold)
	fmt.Println(strings.Repeat("-", 60))
	for _, p := range res.Pruned {
		verb := "PRUNED"
		if dryRun {
			verb = "WOULD PRUNE"
		}
		fmt.Printf("  %s %s %s (ASIN: %s, %d consecutive unavailable runs)\n",
			verb, p.Brand, p.Model, p.ASIN, p.Runs)
	}
	if len(res.Pruned) == 0 {
		fmt.Println("  (no listings met the threshold)")
	}
	fmt.Println()
}

func runUpdate(ctx context.Context, client *rainforest.Client, csvPath string, opts rainforest.SyncOptions) {
	log.Println("=== SYNC: Updating existing listings ===")
	log.Println()

	result, err := rainforest.SyncCSVWithOptions(ctx, client, csvPath, opts)
	if err != nil {
		log.Fatalf("sync failed: %v", err)
	}

	fmt.Println()
	fmt.Println(strings.Repeat("-", 60))
	if result.Skipped > 0 {
		fmt.Printf("SYNC SUMMARY: %d/%d updated, %d unavailable, %d errors, %d skipped (slice/rotation)\n",
			result.Updated, result.Total, result.Unavailable, result.Errors, result.Skipped)
	} else {
		fmt.Printf("SYNC SUMMARY: %d/%d updated, %d unavailable, %d errors\n",
			result.Updated, result.Total, result.Unavailable, result.Errors)
	}
	fmt.Println(strings.Repeat("-", 60))
	for _, c := range result.Changes {
		fmt.Printf("  %s\n", c)
	}
	fmt.Println()
}

func runDiscover(ctx context.Context, client *rainforest.Client, csvPath string, maxPerBrand int) {
	log.Println("=== DISCOVER: Searching for top brand products ===")
	log.Println()

	existingASINs, err := rainforest.ExtractASINs(csvPath)
	if err != nil {
		log.Fatalf("extract ASINs: %v", err)
	}

	brands, err := rainforest.ExtractBrands(csvPath)
	if err != nil {
		log.Fatalf("extract brands: %v", err)
	}

	log.Printf("Found %d existing ASINs across %d brands", len(existingASINs), len(brands))
	log.Println()

	report := rainforest.Discover(ctx, client, brands, existingASINs, maxPerBrand)
	rainforest.PrintReport(report)
}

func envOr(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("invalid %s=%q: %v", key, v, err)
	}
	return n
}
