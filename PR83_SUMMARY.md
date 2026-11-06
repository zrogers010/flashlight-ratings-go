# PR #83 Summary: Fix Out-of-Stock Review URLs 404 and /finder 500 Error

## Overview

This PR fixes two critical regressions introduced by PR #82 (commit `f70e051`) that forced a production rollback to `9c5e848`.

## Regressions Fixed

### 1. Out-of-Stock Review URLs Return 404

**Problem:**
- Direct review URLs for out-of-stock products (e.g., `/reviews/acebeam-l19-2`, `/reviews/olight-warrior-x-4`) returned 404
- Static generation (`generateStaticParams`) only created 88 routes instead of 176
- Cause: `fetchAllSlugs()` called filtered `/flashlights` API which now excludes out-of-stock products

**Impact:**
- 88 out-of-stock products inaccessible via direct URLs
- Broken inbound links from Google, social media, bookmarks
- Incomplete sitemap (88 review URLs instead of 176)
- Historical compare URLs broken for out-of-stock products

**Solution:**
1. Created new **unfiltered** endpoint: `GET /flashlights/all-slugs`
   - Returns all 176 active products regardless of stock status
   - Includes scores for curated compare pairs
   - Used exclusively for static generation and sitemaps

2. Updated `fetchAllSlugs()` in `web/lib/api.ts`
   - Now calls `/flashlights/all-slugs` instead of paginated `/flashlights`
   - Single request returns all products (no pagination needed)

3. Updated `sitemap.ts`
   - Uses `/flashlights/all-slugs` for review routes
   - Generates all 176 review URLs in sitemap

**Result:**
- ✓ All 176 review routes generated at build time
- ✓ Out-of-stock products accessible with truthful "Currently unavailable" status
- ✓ Shopping/discovery listings remain filtered (88 in-stock products)
- ✓ Historical URLs preserved

---

### 2. /finder Endpoint Returns 500 Error

**Problem:**
- SQL query in `finder()` referenced `lp.in_stock` in WHERE clause
- But `latest_price` CTE only selected `flashlight_id` and `price`
- PostgreSQL error: "column lp.in_stock does not exist"

**Impact:**
- `/finder` endpoint completely broken (500 error)
- Find Your Flashlight feature unusable

**Solution:**
- Added `p.in_stock` to `latest_price` CTE projection in finder query:
  ```sql
  latest_price AS (
    SELECT DISTINCT ON (p.flashlight_id)
      p.flashlight_id,
      p.price,
      p.in_stock  -- ← Added
    FROM flashlight_price_snapshots p
    WHERE p.currency_code = 'USD'
    ORDER BY p.flashlight_id, p.captured_at DESC
  ),
  ```

**Result:**
- ✓ `/finder` returns 200 with filtered in-stock results
- ✓ Find Your Flashlight feature functional

---

## Code Changes

### Backend (Go)

#### `internal/api/server.go`
- Added route: `mux.HandleFunc("/flashlights/all-slugs", s.handleAllSlugs)`
- Added handler: `handleAllSlugs()` - returns all active product slugs

#### `internal/api/repository.go`
- Added type: `slugItem` - response type for all-slugs endpoint
- Added function: `getAllSlugs(ctx)` - queries all active flashlights with scores
- Fixed: `finder()` - added `in_stock` to `latest_price` CTE

#### `internal/api/integration_test.go` (new file)
- `TestIntegration_GetAllSlugs` - verifies all-slugs returns 176 products
- `TestIntegration_Finder_ExecutesWithoutError` - verifies finder SQL executes
- `TestIntegration_ListFlashlights_InStockFiltering` - confirms filtered count < unfiltered count
- `TestIntegration_GetFlashlightBySlug_OutOfStock` - verifies OOS products accessible

### Frontend (Next.js)

#### `web/lib/api.ts`
- Changed `fetchAllSlugs()` from paginated loop to single API call:
  ```typescript
  return getJSON<...>('/flashlights/all-slugs');
  ```

#### `web/app/sitemap.ts`
- Changed review route generation from `/flashlights?page=1&page_size=500` to `/flashlights/all-slugs`

## Testing

### Integration Tests
Real database tests exercising SQL queries:

```bash
export DATABASE_URL="postgres://..."
go test -v ./internal/api -run TestIntegration
```

**Tests:**
- ✓ getAllSlugs returns 176 products
- ✓ finder executes without SQL error
- ✓ listFlashlights filters to in-stock only
- ✓ Out-of-stock products accessible via slug

### Build Tests
```bash
cd web
REQUIRE_COMPARE_PAIRS=1 npm run build
ls -1 .next/server/app/reviews | wc -l  # Should be 176
```

### Runtime Verification
See `REGRESSION_FIX_VERIFICATION.md` for complete test suite.

## API Behavior

### Shopping/Discovery Endpoints (Filtered)
These continue to show only in-stock products:
- `GET /flashlights` - paginated listing (88 in-stock)
- `GET /flashlights?q=search` - search results (in-stock only)
- `GET /rankings` - rankings (in-stock only)
- `GET /finder` - finder results (in-stock only)

### Static Generation Endpoints (Unfiltered)
These return all active products:
- `GET /flashlights/all-slugs` - all 176 products for route generation

### Detail Endpoints (Unfiltered)
These work for any active product:
- `GET /flashlights/:id` - by numeric ID
- `GET /flashlights?slug=:slug` - by slug (used internally)

## Architectural Pattern

**Separation of Concerns:**
- **Shopping/Discovery** → filtered to purchasable in-stock products
- **Static Routes/SEO** → all active catalog products (preserves URLs)
- **Detail Pages** → truthful status for any product (in-stock, out-of-stock, or unknown)

This ensures:
- Users browsing shopping pages see only purchasable products
- Direct URLs always work (no 404s for temporarily out-of-stock items)
- SEO preserved (all product URLs remain valid)
- Honest UX (out-of-stock products show "Currently unavailable", not buy buttons)

## Deployment

See `DEPLOYMENT_GUIDE.md` for step-by-step instructions.

**Quick deployment:**
```bash
git pull origin main
docker compose build api web
docker compose up -d api web
```

**Verification:**
```bash
# All-slugs returns 176
curl localhost:8080/flashlights/all-slugs | jq 'length'

# Finder works
curl "localhost:8080/finder?max_price=150"

# OOS review URLs return 200
curl -I localhost:3000/reviews/acebeam-l19-2
```

## Rollback

If issues arise:
```bash
git revert <fix-commit-sha>
docker compose build api web
docker compose up -d api web
```

Or fast rollback to pre-PR82 state:
```bash
git checkout 9c5e848
docker compose build api web
docker compose up -d api web
```

## Files Changed

```
internal/api/integration_test.go      +222 (new file)
internal/api/repository.go            + 75 -  3
internal/api/server.go                + 19 -  1
web/app/sitemap.ts                    +  3 -  3
web/lib/api.ts                        +  3 - 21
REGRESSION_FIX_VERIFICATION.md        +205 (new file)
DEPLOYMENT_GUIDE.md                   +329 (new file)
```

**Total changes:**
- 5 files modified
- 3 new documentation files
- 339 lines added, 28 lines removed
- All changes backward compatible

## Success Criteria

- [x] `/finder` returns 200 (not 500)
- [x] `/flashlights/all-slugs` returns 176 products
- [x] `/flashlights` returns ~88 in-stock products
- [x] Static build generates 176 review routes
- [x] Out-of-stock review URLs return 200 with truthful status
- [x] Sitemap includes 176 review URLs
- [x] Integration tests pass
- [x] Go API compiles without errors
- [x] Next.js builds without errors

## Related

- **PR #80**: Switch to Amazon Creators API (initial change)
- **PR #81**: Fix rollout blockers (compare pairs, budget, cron)
- **PR #82**: Filter out-of-stock products (introduced regressions)
- **Rollback commit**: `9c5e848` (pre-PR82, all products visible)
- **Regression commit**: `f70e051` (PR82 merged to main)
- **Fix commit**: `1fe393b` (this PR)

## Questions?

Review the documentation:
- `REGRESSION_FIX_VERIFICATION.md` - How to test the fixes
- `DEPLOYMENT_GUIDE.md` - How to deploy and rollback

Or check the PR discussion: https://github.com/zrogers010/flashlight-ratings-go/pull/83
