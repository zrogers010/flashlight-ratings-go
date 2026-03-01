package main

import (
	"flag"
	"log"
	"os"
	"time"

	"flashlight-ratings-go/internal/catalog"
)

func main() {
	catalogFile := flag.String("f", "data/catalog.yaml", "catalog YAML file")
	outFile := flag.String("o", "", "output file (defaults to overwriting input)")
	concurrency := flag.Int("c", 3, "concurrent requests")
	delay := flag.Duration("delay", 800*time.Millisecond, "delay between requests")
	skipASIN := flag.Bool("skip-asin", false, "skip ASIN validation")
	skipImages := flag.Bool("skip-images", false, "skip image URL validation")
	skipScrape := flag.Bool("skip-scrape", false, "skip manufacturer site scraping")
	dryRun := flag.Bool("dry-run", false, "validate only, don't write output")
	flag.Parse()

	log.SetFlags(log.Ltime)

	cat, err := catalog.ParseFile(*catalogFile)
	if err != nil {
		log.Fatalf("parse catalog: %v", err)
	}
	log.Printf("catalog-refresh: loaded %d products from %s", len(cat.Products), *catalogFile)

	cfg := catalog.DefaultRefreshConfig()
	cfg.Concurrency = *concurrency
	cfg.RequestDelay = *delay
	cfg.SkipASINCheck = *skipASIN
	cfg.SkipImageCheck = *skipImages
	cfg.SkipScrape = *skipScrape

	if tag := os.Getenv("AMAZON_PARTNER_TAG"); tag != "" {
		cfg.PartnerTag = tag
	}

	refreshed, report := catalog.Refresh(cat, cfg)
	report.Print()

	if *dryRun {
		log.Printf("dry-run: would keep %d of %d products", len(refreshed.Products), len(cat.Products))
		if report.Dropped > 0 {
			os.Exit(1)
		}
		return
	}

	out := *outFile
	if out == "" {
		out = *catalogFile
	}

	if err := catalog.WriteCatalog(out, refreshed); err != nil {
		log.Fatalf("write catalog: %v", err)
	}
	log.Printf("catalog-refresh: wrote %d products to %s", len(refreshed.Products), out)
}
