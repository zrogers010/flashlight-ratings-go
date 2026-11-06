package catalog

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func boolPtr(b bool) *bool {
	return &b
}

func getTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("failed to ping test database: %v", err)
	}
	return db
}

// TestCatalogBuild_PreservesExistingPriceSnapshots verifies that running catalog-build
// on a database with existing price snapshots does not overwrite them.
func TestCatalogBuild_PreservesExistingPriceSnapshots(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Find a product with an existing price snapshot
	var flashlightID int64
	var existingASIN, existingSource string
	var existingInStock bool
	var existingCapturedAt time.Time
	err := db.QueryRowContext(ctx, `
		SELECT fps.flashlight_id, fps.source_sku, fps.source, fps.in_stock, fps.captured_at
		FROM flashlight_price_snapshots fps
		JOIN flashlights f ON f.id = fps.flashlight_id
		WHERE f.is_active = TRUE
		  AND fps.source = 'amazon'
		ORDER BY fps.captured_at DESC
		LIMIT 1
	`).Scan(&flashlightID, &existingASIN, &existingSource, &existingInStock, &existingCapturedAt)
	
	if err == sql.ErrNoRows {
		t.Skip("no existing price snapshots found in test database")
	}
	if err != nil {
		t.Fatalf("failed to query existing snapshot: %v", err)
	}

	// Build a minimal catalog with the same product
	builder := NewBuilder(db, "test-tag-20")
	catalog := &Catalog{
		Products: []Product{
			{
				Brand:     "Test Brand",
				BrandSlug: "test-brand",
				Name:      "Test Product",
				Slug:      "test-product",
				ASIN:      existingASIN,
				PriceUSD:  99.99, // Different price
				Specs: Specs{
					MaxLumens:      1000,
					HasStrobe:      boolPtr(false),
					HasMemoryMode:  boolPtr(false),
					HasLockout:     boolPtr(false),
				},
			},
		},
	}

	// Run catalog build
	if _, err := builder.Build(ctx, catalog); err != nil {
		t.Fatalf("catalog build failed: %v", err)
	}

	// Verify the existing snapshot was NOT modified
	var newInStock bool
	var newCapturedAt time.Time
	var snapshotCount int
	err = db.QueryRowContext(ctx, `
		SELECT in_stock, captured_at, COUNT(*) OVER()
		FROM flashlight_price_snapshots
		WHERE flashlight_id = $1 AND source = 'amazon' AND source_sku = $2
		ORDER BY captured_at DESC
		LIMIT 1
	`, flashlightID, existingASIN).Scan(&newInStock, &newCapturedAt, &snapshotCount)
	
	if err != nil {
		t.Fatalf("failed to query snapshot after build: %v", err)
	}

	// The captured_at timestamp should match the original (not NOW())
	if !newCapturedAt.Equal(existingCapturedAt) {
		t.Errorf("catalog-build modified existing snapshot: old=%v, new=%v", 
			existingCapturedAt, newCapturedAt)
	}

	// in_stock should remain unchanged
	if newInStock != existingInStock {
		t.Errorf("catalog-build changed in_stock: old=%v, new=%v", 
			existingInStock, newInStock)
	}

	// Should still be only one snapshot (no duplicate inserted)
	if snapshotCount != 1 {
		t.Errorf("expected 1 snapshot, found %d", snapshotCount)
	}

	t.Logf("✓ catalog-build preserved existing snapshot (in_stock=%v, captured_at=%v)",
		existingInStock, existingCapturedAt.Format(time.RFC3339))
}

// TestCatalogBuild_DoesNotOverwriteOOSStatus verifies that if a product is marked
// out of stock in the database, catalog-build does not flip it to in_stock=TRUE.
func TestCatalogBuild_DoesNotOverwriteOOSStatus(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Find an out-of-stock product
	var flashlightID int64
	var asin string
	err := db.QueryRowContext(ctx, `
		SELECT f.id, al.asin
		FROM flashlights f
		JOIN affiliate_links al ON al.flashlight_id = f.id AND al.provider = 'amazon'
		JOIN (
			SELECT DISTINCT ON (flashlight_id) flashlight_id, in_stock, source_sku
			FROM flashlight_price_snapshots
			WHERE source = 'amazon' AND currency_code = 'USD'
			ORDER BY flashlight_id, captured_at DESC
		) lp ON lp.flashlight_id = f.id AND lp.source_sku = al.asin
		WHERE f.is_active = TRUE
		  AND lp.in_stock = FALSE
		LIMIT 1
	`).Scan(&flashlightID, &asin)

	if err == sql.ErrNoRows {
		t.Skip("no out-of-stock products found in test database (seed data should include acebeam-l19-2)")
	}
	if err != nil {
		t.Fatalf("failed to find OOS product: %v", err)
	}

	// Run catalog build with this product
	builder := NewBuilder(db, "test-tag-20")
	catalog := &Catalog{
		Products: []Product{
			{
				Brand:     "Test Brand",
				BrandSlug: "test-brand",
				Name:      "Test Product",
				Slug:      "test-product-oos",
				ASIN:      asin,
				PriceUSD:  79.99,
				Specs: Specs{
					MaxLumens:      1500,
					HasStrobe:      boolPtr(false),
					HasMemoryMode:  boolPtr(false),
					HasLockout:     boolPtr(false),
				},
			},
		},
	}

	if _, err := builder.Build(ctx, catalog); err != nil {
		t.Fatalf("catalog build failed: %v", err)
	}

	// Verify product is still out of stock
	var inStock bool
	err = db.QueryRowContext(ctx, `
		SELECT in_stock
		FROM flashlight_price_snapshots
		WHERE flashlight_id = $1 AND source = 'amazon' AND source_sku = $2
		ORDER BY captured_at DESC
		LIMIT 1
	`, flashlightID, asin).Scan(&inStock)

	if err != nil {
		t.Fatalf("failed to query stock status: %v", err)
	}

	if inStock {
		t.Errorf("catalog-build flipped out-of-stock product to in_stock=TRUE (flashlight_id=%d, asin=%s)",
			flashlightID, asin)
	}

	t.Logf("✓ catalog-build preserved out-of-stock status for flashlight_id=%d", flashlightID)
}

// TestCatalogBuild_NewProductGetsSnapshot verifies that catalog-build creates
// price snapshots for new products that don't have any.
func TestCatalogBuild_NewProductGetsSnapshot(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Create a test product with no price snapshots
	testASIN := "B0TESTCATALOG"
	
	// Clean up any existing test data
	_, _ = db.ExecContext(ctx, `
		DELETE FROM flashlight_price_snapshots 
		WHERE source_sku = $1
	`, testASIN)
	_, _ = db.ExecContext(ctx, `
		DELETE FROM affiliate_links 
		WHERE asin = $1
	`, testASIN)
	_, _ = db.ExecContext(ctx, `
		DELETE FROM flashlights 
		WHERE slug = 'test-catalog-product'
	`)

	// Run catalog build with new product
	builder := NewBuilder(db, "test-tag-20")
	catalog := &Catalog{
		Products: []Product{
			{
				Brand:     "Test Brand",
				BrandSlug: "test-brand",
				Name:      "Test Catalog Product",
				Slug:      "test-catalog-product",
				ASIN:      testASIN,
				PriceUSD:  49.99,
				Specs: Specs{
					MaxLumens:      800,
					HasStrobe:      boolPtr(false),
					HasMemoryMode:  boolPtr(false),
					HasLockout:     boolPtr(false),
				},
			},
		},
	}

	if _, err := builder.Build(ctx, catalog); err != nil {
		t.Fatalf("catalog build failed: %v", err)
	}

	// Verify a price snapshot was created
	var flashlightID int64
	var inStock bool
	var price float64
	err := db.QueryRowContext(ctx, `
		SELECT fps.flashlight_id, fps.in_stock, fps.price
		FROM flashlight_price_snapshots fps
		WHERE fps.source_sku = $1 AND fps.source = 'amazon'
	`, testASIN).Scan(&flashlightID, &inStock, &price)

	if err == sql.ErrNoRows {
		t.Fatal("catalog-build did not create price snapshot for new product")
	}
	if err != nil {
		t.Fatalf("failed to query new snapshot: %v", err)
	}

	if !inStock {
		t.Error("new product snapshot should have in_stock=TRUE")
	}

	if price != 49.99 {
		t.Errorf("expected price 49.99, got %v", price)
	}

	t.Logf("✓ catalog-build created snapshot for new product (flashlight_id=%d, in_stock=%v, price=%.2f)",
		flashlightID, inStock, price)

	// Clean up
	_, _ = db.ExecContext(ctx, `DELETE FROM flashlight_price_snapshots WHERE source_sku = $1`, testASIN)
	_, _ = db.ExecContext(ctx, `DELETE FROM affiliate_links WHERE asin = $1`, testASIN)
	_, _ = db.ExecContext(ctx, `DELETE FROM flashlights WHERE id = $1`, flashlightID)
}
