// Command rainforest-sync refreshes data/manual_catalog.csv from Amazon and
// discovers new catalog candidates.
//
// The Amazon Creators API (official, free) is the primary data source when
// AMAZON_CREATORS_CLIENT_ID/SECRET are configured; the Rainforest API (paid
// scraper) reinforces ratings the Creators API withholds and takes over
// completely if Creators credentials are rejected (e.g. Associates
// eligibility lapse).
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

	"flashlight-ratings-go/internal/amazon"
	"flashlight-ratings-go/internal/discovery"
	"flashlight-ratings-go/internal/rainforest"
)

func main() {
	csvPath := flag.String("f", "data/manual_catalog.csv", "path to manual catalog CSV")
	mode := flag.String("mode", "both", "run mode: update, discover, or both")
	delay := flag.Duration("delay", 1*time.Second, "delay between Rainforest API requests")
	dryRun := flag.Bool("dry-run", false, "print changes without writing CSV")
	maxPerBrand := flag.Int("max-per-brand", 10, "max search results per brand+category search in discover mode")
	pruneUnavailable := flag.Int("prune-unavailable", 0, "soft-disable Amazon offers after N consecutive non-purchasable checks (legacy flag name; rows are never deleted)")
	rotateDays := flag.Int("rotate-days", envInt("SYNC_ROTATE_DAYS", 0), "shard the catalog into N daily slices (e.g. 7 = touch ~1/7th of ASINs per run, full coverage every N days). 0 disables rotation.")
	limit := flag.Int("limit", envInt("SYNC_LIMIT", 0), "process at most N rows in update mode (0 = all). Ignored when -rotate-days is set.")
	offset := flag.Int("offset", envInt("SYNC_OFFSET", 0), "skip the first N rows in update mode. Ignored when -rotate-days is set.")
	source := flag.String("source", envOr("SYNC_SOURCE", "auto"), "offer data source: auto (creators with rainforest failover), creators, or rainforest")
	ratingsSource := flag.String("ratings-source", envOr("SYNC_RATINGS_SOURCE", "rainforest"), "ratings reinforcement when the primary source has none: rainforest or off")
	discoverApply := flag.Bool("discover-apply", false, "append vetted discovery candidates directly to the catalog CSV (default: write data/discovery_candidates.csv for review)")
	minRating := flag.Float64("min-rating", 4.3, "discovery: minimum average rating")
	minRatings := flag.Int("min-ratings", 150, "discovery: minimum number of ratings")
	categories := flag.String("categories", "", "discovery: comma-separated category tags to search (default: all of edc,tactical,throw,flood,keychain,headlamp)")
	flag.Parse()

	*mode = strings.ToLower(strings.TrimSpace(*mode))
	if *mode != "update" && *mode != "discover" && *mode != "both" {
		log.Fatalf("invalid mode %q: must be update, discover, or both", *mode)
	}
	*source = strings.ToLower(strings.TrimSpace(*source))
	if *source != "auto" && *source != "creators" && *source != "rainforest" {
		log.Fatalf("invalid -source %q: must be auto, creators, or rainforest", *source)
	}
	*ratingsSource = strings.ToLower(strings.TrimSpace(*ratingsSource))
	if *ratingsSource != "rainforest" && *ratingsSource != "off" {
		log.Fatalf("invalid -ratings-source %q: must be rainforest or off", *ratingsSource)
	}

	partnerTag := envOr("AMAZON_PARTNER_TAG", "flashlightrat-20")

	// Rainforest client (fallback + ratings + legacy discovery).
	var rfClient *rainforest.Client
	if key := os.Getenv("RAINFOREST_API_KEY"); key != "" {
		rfClient = rainforest.NewClient(key, *delay)
	}

	// Creators API client (primary).
	var creatorsClient *amazon.CreatorsClient
	if id := os.Getenv("AMAZON_CREATORS_CLIENT_ID"); id != "" {
		var err error
		creatorsClient, err = amazon.NewCreatorsClient(amazon.CreatorsConfig{
			ClientID:     id,
			ClientSecret: os.Getenv("AMAZON_CREATORS_CLIENT_SECRET"),
			PartnerTag:   partnerTag,
			Marketplace:  envOr("AMAZON_MARKETPLACE", "www.amazon.com"),
		})
		if err != nil {
			log.Fatalf("configure creators api client: %v", err)
		}
	}

	sources, err := buildSources(*source, *ratingsSource, creatorsClient, rfClient)
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()

	if *mode == "update" || *mode == "both" {
		runUpdate(ctx, sources, *csvPath, rainforest.SyncOptions{
			PartnerTag:            partnerTag,
			DryRun:                *dryRun,
			RotateDays:            *rotateDays,
			Limit:                 *limit,
			Offset:                *offset,
			AvailabilityThreshold: *pruneUnavailable,
		})
	}

	if *mode == "discover" || *mode == "both" {
		if creatorsClient != nil {
			runCreatorsDiscover(ctx, creatorsClient, rfClient, *csvPath, discoverOptions{
				apply:        *discoverApply,
				maxPerSearch: *maxPerBrand,
				minRating:    *minRating,
				minRatings:   *minRatings,
				categories:   *categories,
				partnerTag:   partnerTag,
			})
		} else if rfClient != nil {
			log.Println("Creators API not configured — falling back to legacy Rainforest discovery (report only)")
			runLegacyDiscover(ctx, rfClient, *csvPath, *maxPerBrand)
		} else {
			log.Fatal("discover mode requires AMAZON_CREATORS_CLIENT_ID or RAINFOREST_API_KEY")
		}
	}
}

// buildSources assembles the primary/fallback/ratings sources for update mode.
func buildSources(source, ratingsSource string, creators *amazon.CreatorsClient, rf *rainforest.Client) (rainforest.Sources, error) {
	var s rainforest.Sources
	switch source {
	case "rainforest":
		if rf == nil {
			return s, fmt.Errorf("-source=rainforest requires RAINFOREST_API_KEY")
		}
		s.Primary = rf
		return s, nil
	case "creators":
		if creators == nil {
			return s, fmt.Errorf("-source=creators requires AMAZON_CREATORS_CLIENT_ID and AMAZON_CREATORS_CLIENT_SECRET")
		}
		s.Primary = amazon.NewCatalogSource(creators)
	case "auto":
		switch {
		case creators != nil:
			s.Primary = amazon.NewCatalogSource(creators)
			if rf != nil {
				s.Fallback = rf
			} else {
				log.Println("WARNING: RAINFOREST_API_KEY not set — no failover if Creators API access lapses")
			}
		case rf != nil:
			log.Println("Creators API not configured — running on Rainforest only")
			s.Primary = rf
		default:
			return s, fmt.Errorf("set AMAZON_CREATORS_CLIENT_ID/SECRET and/or RAINFOREST_API_KEY")
		}
	}
	if ratingsSource == "rainforest" && rf != nil && s.Primary.SourceName() != "rainforest" {
		s.RatingsFrom = rf
	}
	return s, nil
}

func runUpdate(ctx context.Context, sources rainforest.Sources, csvPath string, opts rainforest.SyncOptions) {
	log.Printf("=== SYNC: Updating existing listings (primary source: %s) ===", sources.Primary.SourceName())
	log.Println()

	result, err := rainforest.SyncCSVWithSources(ctx, sources, csvPath, opts)
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

type discoverOptions struct {
	apply        bool
	maxPerSearch int
	minRating    float64
	minRatings   int
	categories   string
	partnerTag   string
}

func runCreatorsDiscover(ctx context.Context, creators *amazon.CreatorsClient, rf *rainforest.Client, csvPath string, opts discoverOptions) {
	log.Println("=== DISCOVER: Searching Creators API for new catalog candidates ===")
	log.Println()

	existingASINs, err := rainforest.ExtractASINs(csvPath)
	if err != nil {
		log.Fatalf("extract ASINs: %v", err)
	}
	brands, err := discovery.LoadBrandInfo(csvPath)
	if err != nil {
		log.Fatalf("load brand info: %v", err)
	}

	cats := discovery.DefaultCategories
	if opts.categories != "" {
		wanted := map[string]bool{}
		for _, tag := range strings.Split(opts.categories, ",") {
			wanted[strings.TrimSpace(strings.ToLower(tag))] = true
		}
		cats = nil
		for _, c := range discovery.DefaultCategories {
			if wanted[c.Tag] {
				cats = append(cats, c)
			}
		}
		if len(cats) == 0 {
			log.Fatalf("no known categories in %q", opts.categories)
		}
	}

	cfg := discovery.Config{
		Search:         creators,
		Brands:         brands,
		ExistingASINs:  existingASINs,
		Categories:     cats,
		MaxPerSearch:   opts.maxPerSearch,
		MinRating:      opts.minRating,
		MinRatingCount: opts.minRatings,
		PartnerTag:     opts.partnerTag,
	}
	if rf != nil {
		cfg.Ratings = rf
	}

	log.Printf("Searching %d brands x %d categories (~%d requests at 1/s)...",
		len(brands), len(cats), len(brands)*len(cats))
	report, err := discovery.Run(ctx, cfg)
	if err != nil {
		log.Fatalf("discovery failed: %v", err)
	}
	discovery.PrintReport(report)

	if len(report.Candidates) == 0 {
		return
	}
	if opts.apply {
		if err := discovery.AppendToCatalog(csvPath, opts.partnerTag, report.Candidates); err != nil {
			log.Fatalf("append candidates to catalog: %v", err)
		}
		log.Printf("Appended %d candidates to %s — review specs before the next DB import", len(report.Candidates), csvPath)
	} else {
		outPath := discovery.CandidatesPathFor(csvPath)
		if err := discovery.WriteCandidatesCSV(outPath, csvPath, opts.partnerTag, report.Candidates); err != nil {
			log.Fatalf("write candidates: %v", err)
		}
		log.Printf("Wrote %d candidates to %s — review, fill specs, then merge into %s", len(report.Candidates), outPath, csvPath)
	}
}

func runLegacyDiscover(ctx context.Context, client *rainforest.Client, csvPath string, maxPerBrand int) {
	existingASINs, err := rainforest.ExtractASINs(csvPath)
	if err != nil {
		log.Fatalf("extract ASINs: %v", err)
	}
	brands, err := rainforest.ExtractBrands(csvPath)
	if err != nil {
		log.Fatalf("extract brands: %v", err)
	}
	log.Printf("Found %d existing ASINs across %d brands", len(existingASINs), len(brands))
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
