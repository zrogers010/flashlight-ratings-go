package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"flashlight-ratings-go/internal/scoring"

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

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	engine := scoring.NewEngine(db)
	runID, err := engine.RunBatch(ctx, scoring.RunOptions{
		RunLabel:       envOr("SCORING_RUN_LABEL", ""),
		FormulaVersion: envOr("SCORING_FORMULA_VERSION", "v1"),
		InitiatedBy:    envOr("SCORING_INITIATED_BY", "scorejob"),
	})
	if err != nil {
		log.Fatalf("scoring run failed: %v", err)
	}

	fmt.Printf("scoring run completed: run_id=%d\n", runID)
}

func envOr(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}
