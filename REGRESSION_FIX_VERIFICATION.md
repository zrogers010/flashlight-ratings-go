# Regression Fix Verification Plan

This document describes how to verify that the fixes in this PR resolve the two regressions from PR #82.

## Regression 1: Out-of-Stock Review URLs 404

### Problem
- Products like `acebeam-l19-2` and `olight-warrior-x-4` returned 404
- Static generation only created 88 routes instead of 176

### Fix
- Created `/flashlights/all-slugs` endpoint returning all 176 active products
- Updated `fetchAllSlugs()` to use unfiltered endpoint
- Updated `sitemap.ts` to use `/flashlights/all-slugs`

### Verification Steps

#### Local Testing (requires Docker)
```bash
# Start services
docker compose up -d db api

# Wait for DB to be ready
sleep 10

# Test all-slugs endpoint returns 176 products
curl http://localhost:8080/flashlights/all-slugs | jq 'length'
# Expected: 176

# Test filtered endpoint returns only in-stock products
curl http://localhost:8080/flashlights | jq '.total'
# Expected: 88

# Verify specific OOS products are in all-slugs
curl http://localhost:8080/flashlights/all-slugs | jq '.[] | select(.slug == "acebeam-l19-2")'
curl http://localhost:8080/flashlights/all-slugs | jq '.[] | select(.slug == "olight-warrior-x-4")'
# Expected: Both should return product data
```

#### Static Build Testing
```bash
# Build web with strict mode
cd web
REQUIRE_COMPARE_PAIRS=1 npm run build

# Count generated review routes
ls -1 .next/server/app/reviews | wc -l
# Expected: 176 directories (one per product)

# Verify OOS routes exist
ls -la .next/server/app/reviews/acebeam-l19-2
ls -la .next/server/app/reviews/olight-warrior-x-4
# Expected: Both directories should exist
```

#### Production Testing (after deployment)
```bash
# Test OOS review URLs return 200
curl -I https://flashlightratings.com/reviews/acebeam-l19-2
curl -I https://flashlightratings.com/reviews/olight-warrior-x-4
# Expected: HTTP/1.1 200 OK (not 404)

# Verify they show unavailable status (not purchase CTA)
curl https://flashlightratings.com/reviews/acebeam-l19-2 | grep -i "currently unavailable"
# Expected: Should find "Currently unavailable" text

# Verify sitemap includes all 176 review routes
curl https://flashlightratings.com/sitemap.xml | grep -c '<loc>.*reviews/.*</loc>'
# Expected: 176
```

## Regression 2: /finder Returns 500

### Problem
- SQL WHERE clause referenced `lp.in_stock`
- But `latest_price` CTE only selected `flashlight_id` and `price`
- PostgreSQL error: "column lp.in_stock does not exist"

### Fix
- Added `p.in_stock` to `latest_price` CTE projection in finder query

### Verification Steps

#### Local Testing
```bash
# Test finder endpoint with various filters
curl "http://localhost:8080/finder?max_price=150&min_throw=100"
# Expected: 200 OK with JSON array of results

curl "http://localhost:8080/finder?battery_type=18650&use_case=tactical"
# Expected: 200 OK with JSON array

# Test edge cases
curl "http://localhost:8080/finder?max_price=10"
# Expected: 200 OK (may be empty array)

curl "http://localhost:8080/finder?min_throw=10000"
# Expected: 200 OK (may be empty array)
```

#### Integration Test
```bash
# Run integration tests (requires DATABASE_URL)
docker compose up -d db
export DATABASE_URL="postgres://flashlight_app:flashlight_dev@localhost:5432/flashlight?sslmode=disable"
go test -v ./internal/api -run TestIntegration_Finder
# Expected: PASS

go test -v ./internal/api -run TestIntegration_ListFlashlights
# Expected: PASS, confirms in-stock filtering works
```

#### Production Testing
```bash
# Test finder returns 200 with filters
curl -I "https://flashlightratings.com/api/finder?max_price=150&min_throw=100"
# Expected: HTTP/1.1 200 OK (not 500)

# Verify results are properly filtered to in-stock only
curl "https://flashlightratings.com/api/finder?max_price=150" | jq '.[].flashlight_id'
# Expected: Array of IDs (all should be in-stock products)
```

## Complete Test Suite

```bash
#!/bin/bash
set -e

echo "=== Starting Regression Fix Verification ==="

echo "1. Starting services..."
docker compose up -d db api
sleep 10

echo "2. Testing all-slugs endpoint..."
SLUG_COUNT=$(curl -s http://localhost:8080/flashlights/all-slugs | jq 'length')
if [ "$SLUG_COUNT" -ne 176 ]; then
  echo "❌ FAIL: Expected 176 slugs, got $SLUG_COUNT"
  exit 1
fi
echo "✓ PASS: all-slugs returns 176 products"

echo "3. Testing filtered endpoint..."
FILTERED_COUNT=$(curl -s http://localhost:8080/flashlights | jq '.total')
if [ "$FILTERED_COUNT" -lt 50 ] || [ "$FILTERED_COUNT" -gt 120 ]; then
  echo "⚠️  WARNING: Unexpected filtered count: $FILTERED_COUNT (expected ~88)"
fi
echo "✓ PASS: filtered endpoint returns $FILTERED_COUNT products"

echo "4. Testing OOS products in all-slugs..."
ACEBEAM=$(curl -s http://localhost:8080/flashlights/all-slugs | jq '.[] | select(.slug == "acebeam-l19-2")')
OLIGHT=$(curl -s http://localhost:8080/flashlights/all-slugs | jq '.[] | select(.slug == "olight-warrior-x-4")')
if [ -z "$ACEBEAM" ] || [ -z "$OLIGHT" ]; then
  echo "❌ FAIL: OOS products not found in all-slugs"
  exit 1
fi
echo "✓ PASS: OOS products present in all-slugs"

echo "5. Testing finder endpoint..."
FINDER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080/finder?max_price=150&min_throw=100")
if [ "$FINDER_RESPONSE" -ne 200 ]; then
  echo "❌ FAIL: /finder returned $FINDER_RESPONSE"
  exit 1
fi
echo "✓ PASS: /finder returns 200"

echo "6. Running integration tests..."
export DATABASE_URL="postgres://flashlight_app:flashlight_dev@localhost:5432/flashlight?sslmode=disable"
go test -v ./internal/api -run TestIntegration 2>&1 | tee /tmp/integration-test.log
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "❌ FAIL: Integration tests failed"
  exit 1
fi
echo "✓ PASS: Integration tests passed"

echo ""
echo "=== All Tests Passed ✓ ==="
echo ""
echo "Next steps:"
echo "1. Build and test web static generation:"
echo "   cd web && REQUIRE_COMPARE_PAIRS=1 npm run build"
echo "2. Verify 176 review routes generated:"
echo "   ls -1 .next/server/app/reviews | wc -l"
echo "3. Deploy to staging/production"
echo "4. Run production verification tests (see above)"
```

## Expected Outcomes

### Before Fix
- ❌ `/reviews/acebeam-l19-2` → 404
- ❌ `/reviews/olight-warrior-x-4` → 404  
- ❌ `/finder?max_price=150` → 500
- ❌ Sitemap has only 88 review URLs
- ❌ Static build generates only 88 review routes

### After Fix
- ✓ `/reviews/acebeam-l19-2` → 200 (with "Currently unavailable" status)
- ✓ `/reviews/olight-warrior-x-4` → 200 (with "Currently unavailable" status)
- ✓ `/finder?max_price=150` → 200 (with JSON results)
- ✓ Sitemap has 176 review URLs
- ✓ Static build generates 176 review routes
- ✓ Shopping listings show only 88 in-stock products
- ✓ Direct review URLs work for all 176 products
