package api

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func getTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		t.Fatalf("failed to connect to database: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		t.Fatalf("failed to ping database: %v", err)
	}

	return db
}

func TestIntegration_GetAllSlugs(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	server := NewServer(db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	slugs, err := server.getAllSlugs(ctx)
	if err != nil {
		t.Fatalf("getAllSlugs failed: %v", err)
	}

	if len(slugs) == 0 {
		t.Fatal("expected at least one slug, got 0")
	}

	seenSlugs := make(map[string]bool)
	for _, item := range slugs {
		if item.Slug == "" {
			t.Errorf("found item with empty slug: %+v", item)
		}
		if item.ID == 0 {
			t.Errorf("found item with zero ID: %+v", item)
		}
		if seenSlugs[item.Slug] {
			t.Errorf("duplicate slug found: %s", item.Slug)
		}
		seenSlugs[item.Slug] = true
	}

	t.Logf("getAllSlugs returned %d unique slugs", len(slugs))
}

func TestIntegration_Finder_ExecutesWithoutError(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	server := NewServer(db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	budget := 150.0
	minThrow := int64(100)
	filters := finderFilters{
		Budget:   &budget,
		MinThrow: &minThrow,
	}

	results, err := server.finder(ctx, filters, 10)
	if err != nil {
		t.Fatalf("finder query failed: %v", err)
	}

	t.Logf("finder returned %d results", len(results))

	for _, r := range results {
		if r.FlashlightID == 0 {
			t.Errorf("found result with zero ID: %+v", r)
		}
		if r.Brand == "" {
			t.Errorf("found result with empty brand: %+v", r)
		}
		if r.Name == "" {
			t.Errorf("found result with empty name: %+v", r)
		}
	}
}

func TestIntegration_ListFlashlights_InStockFiltering(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	server := NewServer(db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	filters := flashlightFilters{
		Page:     1,
		PageSize: 100,
	}

	items, total, err := server.listFlashlights(ctx, filters)
	if err != nil {
		t.Fatalf("listFlashlights failed: %v", err)
	}

	t.Logf("listFlashlights returned %d items, total: %d", len(items), total)

	for _, item := range items {
		if item.AvailabilityStatus != "in_stock" {
			t.Errorf("expected in_stock only, got: %s for item %d (%s)", 
				item.AvailabilityStatus, item.ID, item.Slug)
		}
		if item.AmazonURL == nil || *item.AmazonURL == "" {
			t.Errorf("expected non-empty amazon_url for in_stock item %d (%s)", 
				item.ID, item.Slug)
		}
	}

	var allActiveCount int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM flashlights WHERE is_active = TRUE").Scan(&allActiveCount)
	if err != nil {
		t.Fatalf("failed to count active flashlights: %v", err)
	}

	slugs, err := server.getAllSlugs(ctx)
	if err != nil {
		t.Fatalf("getAllSlugs failed: %v", err)
	}

	if len(slugs) != allActiveCount {
		t.Errorf("getAllSlugs count (%d) should equal all active count (%d)", len(slugs), allActiveCount)
	}

	// Filtered count should be <= total count
	// (May be equal if all products are in stock)
	if total > allActiveCount {
		t.Errorf("filtered count (%d) cannot exceed all active count (%d)", total, allActiveCount)
	}

	// getAllSlugs should always return at least as many as filtered
	// (Equal if all products are in stock, more if some are OOS)
	if len(slugs) < total {
		t.Errorf("getAllSlugs count (%d) should be >= filtered count (%d)", len(slugs), total)
	}

	if len(slugs) == total {
		t.Logf("All %d products are in stock (filtered count == unfiltered count)", total)
	} else {
		t.Logf("Verified: getAllSlugs (%d) > listFlashlights (%d), confirming unfiltered vs filtered", 
			len(slugs), total)
	}
}

func TestIntegration_OutOfStockProducts_InAllSlugs(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	server := NewServer(db)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get all out-of-stock product slugs from database
	var oosSlugs []string
	rows, err := db.QueryContext(ctx, `
		SELECT f.slug 
		FROM flashlights f
		LEFT JOIN (
			SELECT DISTINCT ON (flashlight_id) 
				flashlight_id, in_stock
			FROM flashlight_price_snapshots
			WHERE currency_code = 'USD'
			ORDER BY flashlight_id, captured_at DESC
		) lp ON lp.flashlight_id = f.id
		WHERE f.is_active = TRUE 
		  AND (lp.in_stock = FALSE OR lp.in_stock IS NULL)
		LIMIT 10
	`)
	if err != nil {
		t.Fatalf("failed to query out-of-stock slugs: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			t.Fatalf("failed to scan slug: %v", err)
		}
		oosSlugs = append(oosSlugs, slug)
	}

	if len(oosSlugs) == 0 {
		t.Skip("no out-of-stock products found in test database")
	}

	// Get all slugs from getAllSlugs endpoint
	allSlugs, err := server.getAllSlugs(ctx)
	if err != nil {
		t.Fatalf("getAllSlugs failed: %v", err)
	}

	slugMap := make(map[string]bool)
	for _, item := range allSlugs {
		slugMap[item.Slug] = true
	}

	// Verify OOS products are in getAllSlugs
	for _, slug := range oosSlugs {
		if !slugMap[slug] {
			t.Errorf("out-of-stock product %s not found in getAllSlugs", slug)
		} else {
			t.Logf("✓ Out-of-stock product %s found in getAllSlugs", slug)
		}
	}
}

func ptrFloat64(v float64) *float64 {
	return &v
}

func ptrInt64(v int64) *int64 {
	return &v
}
