package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	"flashlight-ratings-go/internal/api"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	db.SetConnMaxLifetime(15 * time.Minute)
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)

	apiSrv := api.NewServer(db)

	httpSrv := &http.Server{
		Addr:         addr,
		Handler:      apiSrv.Routes(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("api listening on %s", addr)
	if err := httpSrv.ListenAndServe(); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
