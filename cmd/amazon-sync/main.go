package main

import (
	"database/sql"
	"log"
	"os"
	"strconv"
	"time"

	"flashlight-ratings-go/internal/amazon"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	timeout := 2 * time.Minute
	if v := os.Getenv("AMAZON_SYNC_TIMEOUT_SEC"); v != "" {
		sec, err := strconv.Atoi(v)
		if err != nil || sec <= 0 {
			log.Fatalf("invalid AMAZON_SYNC_TIMEOUT_SEC: %q", v)
		}
		timeout = time.Duration(sec) * time.Second
	}
	ctx, cancel := amazon.NewContext(timeout)
	defer cancel()

	cfg := amazon.SyncConfig{
		Region:       envOr("AMAZON_REGION", "US"),
		PartnerTag:   envOr("AMAZON_PARTNER_TAG", ""),
		DryRun:       envOr("AMAZON_SYNC_DRY_RUN", "false") == "true",
		BatchSize:    envIntOr("AMAZON_SYNC_BATCH_SIZE", 10),
		MaxRetries:   envIntOr("AMAZON_SYNC_MAX_RETRIES", 2),
		RetryBackoff: time.Duration(envIntOr("AMAZON_SYNC_RETRY_BACKOFF_MS", 750)) * time.Millisecond,
	}

	var client amazon.Client = &amazon.StubClient{}
	if !cfg.DryRun {
		realClient, err := amazon.NewPAAPIClient(amazon.PAAPIConfig{
			AccessKeyID:     envOr("AMAZON_ACCESS_KEY_ID", ""),
			SecretAccessKey: envOr("AMAZON_SECRET_ACCESS_KEY", ""),
			PartnerTag:      cfg.PartnerTag,
			RegionCode:      cfg.Region,
			PartnerType:     envOr("AMAZON_PARTNER_TYPE", "Associates"),
			Marketplace:     envOr("AMAZON_MARKETPLACE", ""),
		})
		if err != nil {
			log.Fatalf("configure paapi client: %v", err)
		}
		client = realClient
	}

	syncer := amazon.NewSyncer(db, client, cfg)
	if err := syncer.Run(ctx); err != nil {
		log.Fatalf("amazon sync failed: %v", err)
	}
	log.Println("amazon sync completed")
}

func envOr(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func envIntOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
