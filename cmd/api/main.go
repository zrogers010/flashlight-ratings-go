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

	srv := api.NewServer(db)

	log.Printf("api listening on %s", addr)
	if err := http.ListenAndServe(addr, srv.Routes()); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
