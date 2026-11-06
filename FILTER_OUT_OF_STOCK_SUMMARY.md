# Filter Out-of-Stock Products - Implementation Summary

**PR:** [#82](https://github.com/zrogers010/flashlight-ratings-go/pull/82)  
**Branch:** `cursor/filter-out-of-stock-7e5a`  
**Base:** main (9c5e848)  
**Status:** ✅ Ready for review - awaiting approval before merge

---

## Bottom Line

**Implemented explicit filtering to exclude out-of-stock products from all shopping/discovery listings while preserving detail page access and compare URLs.**

### Before
```
/api/flashlights
{
  "items": [88 in-stock + 88 out-of-stock],
  "total": 176
}
```

### After
```
/api/flashlights
{
  "items": [88 in-stock only],
  "total": 88
}
```

---

## Exact Behavior Changes

### 1. Shopping/Discovery Listings - NOW FILTERED

**Endpoints affected:**
- `GET /api/flashlights` - Product listings
- `GET /api/rankings/:useCase` - Best-of rankings  
- `GET /api/finder` - Find yours tool

**Filtering criteria:**
```
Include if ALL true:
  - in_stock = TRUE
  - affiliate_links.is_active = TRUE
  - affiliate_url IS NOT NULL
  - affiliate_url != ''

Exclude if ANY true:
  - in_stock = FALSE (out of stock)
  - in_stock = NULL (unknown)
  - affiliate_url IS NULL
  - affiliate_url = '' (empty string)
```

**Result:**
- Only currently purchasable products appear
- Pagination totals reflect filtered count
- No empty pages from count mismatch

### 2. Detail Pages - NO CHANGES (Always Accessible)

**Endpoints NOT affected:**
- `GET /api/flashlights/:id` - Detail by ID
- `GET /api/reviews/:slug` - Detail by slug
- Compare pages - Any combination

**Behavior:**
- Out-of-stock products remain accessible via direct URL
- Show truthful "Currently unavailable" badge
- No misleading "Buy" buttons
- Price history, ratings, reviews, specs all preserved

### 3. Compare URLs - NO CHANGES (Always Work)

**Endpoint:** `/compare/:slugA-vs-:slugB`

**Behavior:**
- Works for any product combination
- Out-of-stock products load normally
- Truthful availability status shown
- "Currently unavailable" badge displayed when appropriate

### 4. Automatic Return to Stock

**When product restocked:**
1. Sync updates `in_stock = TRUE` in `flashlight_price_snapshots`
2. Next API call includes product in listings automatically
3. No manual intervention required
4. No flag to reset, no cache to clear

---

## Code Changes

### Files Modified: 2

1. **`internal/api/repository.go`** - Backend filtering logic
   - `listFlashlights`: Query + post-process filtering
   - `rankings`: Query + post-process filtering
   - `finder`: Query WHERE clause filtering
   - `countFlashlights`: Count only filtered items

2. **`internal/api/availability_filter_test.go`** (new) - Test coverage
   - Core filtering logic tests
   - Mixed availability scenarios
   - All-unavailable edge case
   - Return-to-stock behavior
   - Detail preservation documentation

### Files Deleted: 1

- `api` - Removed stray compiled binary (not source code)

---

## Query Changes

### listFlashlights (Product Listings)

**Before:**
```sql
WHERE f.is_active = TRUE
ORDER BY 
  CASE WHEN lp.in_stock = FALSE THEN 1 ELSE 0 END ASC,
  ...
```
*Out-of-stock sorted last but still included*

**After:**
```sql
WHERE f.is_active = TRUE
  AND lp.in_stock = TRUE
  AND la.affiliate_url IS NOT NULL
  AND la.affiliate_url != ''
ORDER BY ...
```
*Out-of-stock excluded at source*

### countFlashlights (Pagination Totals)

**Before:**
```sql
SELECT COUNT(*)
FROM flashlights f
WHERE f.is_active = TRUE
```
*Counted all active products (176)*

**After:**
```sql
SELECT COUNT(*)
FROM flashlights f
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN latest_affiliate la ON la.flashlight_id = f.id
WHERE f.is_active = TRUE
  AND lp.in_stock = TRUE
  AND la.affiliate_url IS NOT NULL
  AND la.affiliate_url != ''
```
*Counts only purchasable products (~88)*

### rankings (Best-Of Lists)

**Before:**
```sql
WHERE f.is_active = TRUE
ORDER BY
  CASE WHEN lp.in_stock = FALSE THEN 1 ELSE 0 END ASC,
  COALESCE(fs.score, 0) DESC
```
*Out-of-stock sorted last but still included*

**After:**
```sql
WHERE f.is_active = TRUE
  AND lp.in_stock = TRUE
  AND la.affiliate_url IS NOT NULL
  AND la.affiliate_url != ''
ORDER BY
  COALESCE(fs.score, 0) DESC
```
*Out-of-stock excluded at source*

---

## Test Coverage

### All Tests Pass ✅

```bash
go test -v ./internal/api -run TestAvailability
# PASS: TestAvailabilityFilterLogic (6 scenarios)
# PASS: TestAvailabilityStatus (existing test)

go test -v ./internal/api -run "TestMixed|TestAllUnavailable|TestReturnToStock|TestDetailPreservation"
# PASS: TestMixedAvailabilityListFiltering
# PASS: TestAllUnavailableCase
# PASS: TestReturnToStockBehavior
# PASS: TestDetailPreservation

go build ./cmd/api
# Compiles successfully
```

### Test Scenarios

| Scenario | in_stock | affiliate_url | Included? |
|----------|----------|---------------|-----------|
| In stock, valid URL | TRUE | https://... | ✅ YES |
| Out of stock, valid URL | FALSE | https://... | ❌ NO |
| Unknown, valid URL | NULL | https://... | ❌ NO |
| In stock, nil URL | TRUE | NULL | ❌ NO |
| In stock, empty URL | TRUE | "" | ❌ NO |
| Out of stock, nil URL | FALSE | NULL | ❌ NO |

---

## Deployment Instructions

### Pre-Deployment Checklist

- [ ] PR #82 approved and merged to main
- [ ] Production database backup completed
- [ ] API service health check passed
- [ ] Deployment window scheduled

### Step 1: Deploy API

```bash
# SSH to production server
ssh deploy@your-server

# Pull latest code
cd /home/deploy/flashlight-ratings-go
git fetch origin
git checkout main
git pull origin main

# Verify commit
git log --oneline -1
# Should show PR #82 merge commit

# Rebuild API
go build -o bin/api ./cmd/api

# Restart service
sudo systemctl restart flashlight-ratings-go

# Verify service started
sudo systemctl status flashlight-ratings-go
```

**Or with Docker:**
```bash
cd /home/deploy/flashlight-ratings-go
docker-compose build api
docker-compose restart api
docker-compose logs api --tail=50
```

### Step 2: Verify Filtering Works

```bash
# 1. Check listing total (should be ~88, not 176)
curl -s https://your-domain.com/api/flashlights?page=1 | jq '{total: .total, items_count: (.items | length)}'
# Expected: {"total": 88, "items_count": 20}

# 2. Verify no out-of-stock in listings
curl -s https://your-domain.com/api/flashlights?page=1 | jq '.items[] | select(.availability_status != "in_stock")'
# Expected: (empty - no out-of-stock items)

# 3. Verify detail page for out-of-stock product still accessible
curl -I https://your-domain.com/api/flashlights/123
# Expected: HTTP 200 OK (even if product is out of stock)

# 4. Check pagination works correctly
curl -s https://your-domain.com/api/flashlights?page=5&pageSize=20 | jq '.items | length'
# Expected: Up to 20 items (or fewer on last page, not empty)

# 5. Check rankings filtered
curl -s https://your-domain.com/api/rankings/tactical?page=1 | jq '.items[] | select(.flashlight.availability_status != "in_stock")'
# Expected: (empty - no out-of-stock items)
```

### Step 3: Verify Direct URLs Work

```bash
# Detail pages should work for all products
curl -I https://your-domain.com/reviews/some-product-slug
# Expected: HTTP 200

# Compare pages should work for all combinations
curl -I https://your-domain.com/compare/product-a-vs-product-b
# Expected: HTTP 200
```

### Step 4: Monitor Post-Deployment

**Watch for:**
- ✅ Reduced listing totals (expected - out-of-stock excluded)
- ✅ Pagination working (no empty pages)
- ✅ Detail pages accessible for all products
- ✅ Compare URLs working
- ⚠️ No 500 errors in API logs
- ⚠️ No database connection errors

**Check logs:**
```bash
sudo journalctl -u flashlight-ratings-go -f
# Or: docker-compose logs api -f
```

---

## Verification Examples

### Example 1: Product Listings

**Before (176 total):**
```json
GET /api/flashlights?page=1
{
  "items": [
    {"id": 1, "name": "Product A", "availability_status": "in_stock"},
    {"id": 2, "name": "Product B", "availability_status": "out_of_stock"},
    {"id": 3, "name": "Product C", "availability_status": "in_stock"},
    ...
  ],
  "total": 176,
  "page": 1,
  "pageSize": 20
}
```

**After (~88 total):**
```json
GET /api/flashlights?page=1
{
  "items": [
    {"id": 1, "name": "Product A", "availability_status": "in_stock"},
    {"id": 3, "name": "Product C", "availability_status": "in_stock"},
    ...
  ],
  "total": 88,
  "page": 1,
  "pageSize": 20
}
```

### Example 2: Detail Page (Unchanged)

**Before and After (same):**
```json
GET /api/flashlights/2
{
  "id": 2,
  "name": "Product B",
  "availability_status": "out_of_stock",
  "amazon_url": null,
  "price_usd": 49.99,
  "rating_count": 205,
  ...
}
```
*Still accessible via direct URL*

### Example 3: Compare Page (Unchanged)

**Before and After (same):**
```
GET /compare/product-a-vs-product-b

Page loads successfully even if one or both products are out of stock.
"Currently unavailable" badge shown where appropriate.
```

---

## Rollback Procedure

If issues occur:

```bash
cd /home/deploy/flashlight-ratings-go

# Find commit before PR #82
git log --oneline -5
# Note the commit hash before PR #82

# Rollback
git checkout <hash-before-pr82>
go build -o bin/api ./cmd/api
sudo systemctl restart flashlight-ratings-go

# Or with Docker
git checkout <hash-before-pr82>
docker-compose build api
docker-compose restart api
```

**Total rollback time:** <5 minutes

---

## FAQ

### Q: Will this affect search engine rankings?

**A:** No. Detail pages remain accessible and indexed. Only shopping/discovery listings are filtered, which is expected behavior (you don't want search engines indexing unavailable products in your shopping experience).

### Q: What happens when a product is restocked?

**A:** It automatically reappears in listings on the next API call after sync updates `in_stock = TRUE`. No manual action required.

### Q: Can users still see out-of-stock products?

**A:** Yes, via:
- Direct URL to detail page (`/reviews/:slug`)
- Direct product ID (`/flashlights/:id`)
- Compare URLs (`/compare/a-vs-b`)
- Google search results (detail pages indexed)

They just won't appear in browsing/discovery listings.

### Q: What if ALL products become out of stock?

**A:** Listings return empty `[]` with `total: 0`. No errors, pagination works correctly (shows page 1 of 0 items).

### Q: Does this affect the web frontend?

**A:** No changes needed. The web frontend calls the API, which now returns filtered data. The frontend displays what the API provides. No JavaScript changes required.

### Q: How does pagination work now?

**A:** Correctly! The `countFlashlights` function now matches the filtering, so:
- Total reflects actual items
- Last page may have fewer items
- No empty pages from count mismatch

---

## Success Criteria

Deployment is successful when:

- [ ] `/api/flashlights` total ≈ 88 (down from 176)
- [ ] No `out_of_stock` products in listing results
- [ ] Pagination works without empty pages
- [ ] Detail pages return 200 for all product IDs
- [ ] Compare URLs work for all product combinations
- [ ] No 500 errors in logs
- [ ] Products reappear automatically when restocked

---

## References

- **PR:** https://github.com/zrogers010/flashlight-ratings-go/pull/82
- **Base Commit:** 9c5e848 (main after PR #81)
- **Test Coverage:** `internal/api/availability_filter_test.go`
- **Modified Endpoints:**
  - `GET /api/flashlights` (listings)
  - `GET /api/rankings/:useCase` (rankings)
  - `GET /api/finder` (recommendations)

---

**Status:** ✅ Ready for deployment after approval  
**DO NOT MERGE until user approves**
