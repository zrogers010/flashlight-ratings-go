package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"flashlight-ratings-go/internal/amazon"
	"flashlight-ratings-go/internal/scoring"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type workerConfig struct {
	interval         time.Duration
	runOnStart       bool
	syncTimeout      time.Duration
	scoreTimeout     time.Duration
	scoreFormula     string
	scoreInitiatedBy string
	amazonSync       amazon.SyncConfig
}

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	cfg := loadConfig()

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	client, err := buildAmazonClient(cfg.amazonSync)
	if err != nil {
		log.Fatalf("configure creators api client: %v", err)
	}

	runCycle := func() {
		log.Println("worker cycle started")

		// BE-04: Check for stale data before sync
		checkDataStaleness(ctx, db)

		syncCtx, cancelSync := context.WithTimeout(ctx, cfg.syncTimeout)
		syncer := amazon.NewSyncer(db, client, cfg.amazonSync)
		if err := syncer.Run(syncCtx); err != nil {
			// The CSV catalog sync keeps the DB fresh independently, so a
			// failed Amazon pull (e.g. Creators API eligibility lapse) must
			// not block score recomputation.
			// BE-04: Log Creators→Rainforest failover scenario
			log.Printf("⚠️  amazon sync failed (continuing to scoring): %v", err)
			log.Printf("📋 NOTE: If Creators API is unavailable, consider Rainforest API fallback")
		} else {
			log.Println("✅ amazon sync completed")
		}
		cancelSync()

		scoreCtx, cancelScore := context.WithTimeout(ctx, cfg.scoreTimeout)
		engine := scoring.NewEngine(db)
		runID, err := engine.RunBatch(scoreCtx, scoring.RunOptions{
			RunLabel:       "worker-" + time.Now().UTC().Format("20060102-150405"),
			FormulaVersion: cfg.scoreFormula,
			InitiatedBy:    cfg.scoreInitiatedBy,
		})
		cancelScore()
		if err != nil {
			log.Printf("score batch failed: %v", err)
			return
		}
		log.Printf("score batch completed: run_id=%d", runID)
	}

	if cfg.runOnStart {
		runCycle()
	}

	ticker := time.NewTicker(cfg.interval)
	defer ticker.Stop()
	log.Printf("worker scheduler running interval=%s", cfg.interval)

	for {
		select {
		case <-ctx.Done():
			log.Println("worker shutting down")
			return
		case <-ticker.C:
			runCycle()
		}
	}
}

func buildAmazonClient(cfg amazon.SyncConfig) (amazon.Client, error) {
	if cfg.DryRun {
		return nil, nil
	}
	return amazon.NewCreatorsClient(amazon.CreatorsConfig{
		ClientID:     envOr("AMAZON_CREATORS_CLIENT_ID", ""),
		ClientSecret: envOr("AMAZON_CREATORS_CLIENT_SECRET", ""),
		PartnerTag:   cfg.PartnerTag,
		Marketplace:  envOr("AMAZON_MARKETPLACE", "www.amazon.com"),
	})
}

func loadConfig() workerConfig {
	return workerConfig{
		interval:         time.Duration(envIntOr("WORKER_INTERVAL_SEC", 1800)) * time.Second,
		runOnStart:       envOr("WORKER_RUN_ON_START", "true") == "true",
		syncTimeout:      time.Duration(envIntOr("AMAZON_SYNC_TIMEOUT_SEC", 120)) * time.Second,
		scoreTimeout:     time.Duration(envIntOr("SCOREJOB_TIMEOUT_SEC", 120)) * time.Second,
		scoreFormula:     envOr("SCORING_FORMULA_VERSION", "v1"),
		scoreInitiatedBy: envOr("SCORING_INITIATED_BY", "worker"),
		amazonSync: amazon.SyncConfig{
			Region:         envOr("AMAZON_REGION", "US"),
			Marketplace:    envOr("AMAZON_MARKETPLACE", ""),
			PartnerTag:     envOr("AMAZON_PARTNER_TAG", ""),
			DryRun:         envOr("AMAZON_SYNC_DRY_RUN", "false") == "true",
			BatchSize:      envIntOr("AMAZON_SYNC_BATCH_SIZE", 10),
			MaxRetries:     envIntOr("AMAZON_SYNC_MAX_RETRIES", 2),
			RetryBackoff:   time.Duration(envIntOr("AMAZON_SYNC_RETRY_BACKOFF_MS", 750)) * time.Millisecond,
			AllowedBrands:  parseCSVSet(envOr("AMAZON_ALLOWED_BRANDS", "")),
			AllowedSellers: parseCSVSet(envOr("AMAZON_ALLOWED_SELLERS", "")),
		},
	}
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

func parseCSVSet(v string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, part := range strings.Split(v, ",") {
		norm := strings.ToLower(strings.TrimSpace(part))
		if norm == "" {
			continue
		}
		out[norm] = struct{}{}
	}
	return out
}

// BE-04: Check for stale OOS and in-stock price data
func checkDataStaleness(ctx context.Context, db *sql.DB) {
	// Check for OOS items stuck for >48 hours
	oosQuery := `
SELECT COUNT(DISTINCT fps.flashlight_id)
FROM flashlight_price_snapshots fps
JOIN (
	SELECT flashlight_id, MAX(captured_at) AS latest
	FROM flashlight_price_snapshots
	WHERE currency_code = 'USD'
	GROUP BY flashlight_id
) latest_snap ON fps.flashlight_id = latest_snap.flashlight_id AND fps.captured_at = latest_snap.latest
WHERE fps.in_stock = FALSE
  AND fps.captured_at < NOW() - INTERVAL '48 hours'
`
	var oosCount int
	if err := db.QueryRowContext(ctx, oosQuery).Scan(&oosCount); err != nil {
		log.Printf("⚠️  failed to check OOS staleness: %v", err)
	} else if oosCount > 0 {
		log.Printf("⚠️  %d flashlights marked OOS for >48 hours", oosCount)
	}

	// Check for in-stock items with stale prices >24 hours
	staleQuery := `
SELECT COUNT(DISTINCT fps.flashlight_id)
FROM flashlight_price_snapshots fps
JOIN (
	SELECT flashlight_id, MAX(captured_at) AS latest
	FROM flashlight_price_snapshots
	WHERE currency_code = 'USD'
	GROUP BY flashlight_id
) latest_snap ON fps.flashlight_id = latest_snap.flashlight_id AND fps.captured_at = latest_snap.latest
WHERE fps.in_stock = TRUE
  AND fps.captured_at < NOW() - INTERVAL '24 hours'
`
	var staleCount int
	if err := db.QueryRowContext(ctx, staleQuery).Scan(&staleCount); err != nil {
		log.Printf("⚠️  failed to check price staleness: %v", err)
	} else if staleCount > 0 {
		log.Printf("⚠️  %d in-stock flashlights have prices >24 hours old", staleCount)
	}
}
