package main

import (
	"context"
	"database/sql"
	"flag"
	"log"
	"os"
	"time"

	"flashlight-ratings-go/internal/catalog"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	catalogFile := flag.String("f", "data/catalog.yaml", "path to catalog YAML file")
	validateOnly := flag.Bool("validate", false, "validate catalog without writing to DB")
	partnerTag := flag.String("partner-tag", "", "Amazon partner tag (overrides AMAZON_PARTNER_TAG env)")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("catalog-build: ")

	cat, err := catalog.ParseFile(*catalogFile)
	if err != nil {
		log.Fatalf("parse: %v", err)
	}
	log.Printf("loaded %d products from %s", len(cat.Products), *catalogFile)

	warnings := cat.Validate()
	for _, w := range warnings {
		log.Printf("WARN %s", w)
	}

	if *validateOnly {
		if len(warnings) > 0 {
			log.Printf("%d warnings found", len(warnings))
			os.Exit(1)
		}
		log.Println("catalog is valid")
		return
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	tag := *partnerTag
	if tag == "" {
		tag = os.Getenv("AMAZON_PARTNER_TAG")
	}
	if tag == "" {
		log.Fatal("AMAZON_PARTNER_TAG is required (env or -partner-tag flag)")
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("db ping: %v", err)
	}

	builder := catalog.NewBuilder(db, tag)
	result, err := builder.Build(ctx, cat)
	if err != nil {
		log.Fatalf("build failed: %v", err)
	}

	log.Printf("done: %d brands, %d products, %d images, %d affiliate links",
		result.Brands, result.Products, result.Images, result.Affiliates)
}
