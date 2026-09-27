# W1-01: Availability-Aware Ranking Verification

## Changes Summary

### 1. Ranking Logic Update
**File**: `internal/api/repository.go` - `rankings()` function

**Change**: Modified SQL query to prioritize in-stock products in ranking order.

**Sort Key** (new):
```
ORDER BY
  COALESCE(lp.in_stock, FALSE) DESC,  -- In-stock products first
  COALESCE(fs.score, 0) DESC,         -- Then by score (highest first)
  f.id ASC                             -- Tie-breaker
```

**Behavior**:
- All in-stock products appear before out-of-stock products
- Within each group (in-stock vs OOS), products are sorted by score descending
- Out-of-stock products are demoted but NOT removed from the catalog
- Stock status is now included in the response: `amazon_in_stock` field

### 2. In-Stock Alternate Exposure
**File**: `internal/api/server.go` - New `alternateInStock` type
**File**: `internal/api/repository.go` - New `findInStockAlternate()` function

**Change**: When the #1 ranked product is out of stock, the API now includes an `alternate_in_stock` object with the highest-scoring in-stock product.

**Response Structure**:
```json
{
  "rank": 1,
  "score": 92.5,
  "flashlight": {
    "id": 123,
    "brand": "Olight",
    "name": "Warrior X Pro",
    "amazon_in_stock": false,
    ...
  },
  "alternate_in_stock": {
    "id": 456,
    "brand": "Streamlight",
    "name": "ProTac HL-X",
    "score": 89.2,
    "rank": 2,
    "image_url": "...",
    "amazon_url": "...",
    ...
  }
}
```

**Behavior**:
- Only appears when rank #1 (on page 1) has `amazon_in_stock: false`
- Contains the highest-scoring in-stock product from the same use case
- Frontend can use this to badge/highlight the alternate as "Top In-Stock Pick"

### 3. General Listing Update
**File**: `internal/api/repository.go` - `listFlashlights()` function

**Change**: The `/flashlights` endpoint now also demotes OOS products in all sort modes.

**Sort Key** (updated):
```
ORDER BY
  COALESCE(lp.in_stock, FALSE) DESC,  -- In-stock first
  {user_sort_expr} {ASC|DESC},        -- Then user's chosen sort
  f.id ASC                             -- Tie-breaker
```

**Behavior**:
- Works with all existing sort parameters: `sort_by=overall_score`, `sort_by=price`, `sort_by=max_lumens`, etc.
- In-stock products always appear before OOS, regardless of the sort field
- The user's chosen sort order is respected within each stock group

### 4. Catalog Count
**Status**: ✅ Already accurate

The catalog count is dynamically calculated via:
```sql
SELECT COUNT(*) FROM flashlights WHERE is_active = TRUE
```

**Verification**:
- Homepage displays: `flashlights.total` from API response
- No hardcoded counts found in frontend code
- Count will always reflect the actual number of active flashlights in the database (≥178)

## Testing & Verification

### Automated Tests
**File**: `internal/api/ranking_test.go`

Contains test stubs documenting expected behavior. Full integration tests require:
- Test database with fixture data
- Flashlights with varying scores and stock statuses

### Manual Verification Steps

#### 1. Verify OOS Demotion in Rankings
```bash
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=20' | jq '.items[] | {rank, brand, name, in_stock: .flashlight.amazon_in_stock, score}'
```

**Expected**:
- All items with `in_stock: true` appear before `in_stock: false`
- Within in-stock items: scores are descending
- Within OOS items: scores are descending
- Rank numbers are sequential: 1, 2, 3, ...

#### 2. Verify Alternate Exposure When #1 is OOS
```bash
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=5' | jq '.items[0] | {rank, in_stock: .flashlight.amazon_in_stock, alternate_in_stock}'
```

**Expected**:
- If rank #1 has `in_stock: false`, response includes `alternate_in_stock` object
- Alternate contains: `id`, `brand`, `name`, `slug`, `score`, `rank`, `image_url`, `amazon_url`, etc.
- If rank #1 has `in_stock: true`, `alternate_in_stock` is `null` or absent

#### 3. Verify OOS Demotion in General Listing
```bash
curl 'http://localhost:8080/flashlights?page=1&page_size=20&sort_by=overall_score&order=desc' | jq '.items[] | {id, brand, name, in_stock: .amazon_in_stock, score: .overall_score}'
```

**Expected**:
- In-stock products appear first
- User's sort order (e.g., by score) is respected within each stock group

#### 4. Verify Catalog Count
```bash
curl 'http://localhost:8080/flashlights?page=1&page_size=1' | jq '.total'
```

**Expected**:
- Returns the actual count of active flashlights in the database (≥178)
- Visit homepage and verify the displayed count matches the API response

### Database Inspection (Optional)
```sql
-- Check stock distribution
SELECT
  COALESCE(lp.in_stock, FALSE) AS in_stock,
  COUNT(*) AS count
FROM flashlights f
LEFT JOIN LATERAL (
  SELECT in_stock
  FROM flashlight_price_snapshots
  WHERE flashlight_id = f.id
  ORDER BY captured_at DESC
  LIMIT 1
) lp ON TRUE
WHERE f.is_active = TRUE
GROUP BY COALESCE(lp.in_stock, FALSE);

-- Check top tactical flashlights with stock status
WITH latest_price AS (
  SELECT DISTINCT ON (flashlight_id)
    flashlight_id,
    in_stock
  FROM flashlight_price_snapshots
  WHERE currency_code = 'USD'
  ORDER BY flashlight_id, captured_at DESC
)
SELECT
  f.id,
  b.name AS brand,
  f.name,
  lp.in_stock,
  fs.score
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN flashlight_scores fs ON fs.flashlight_id = f.id
JOIN scoring_profiles sp ON sp.id = fs.profile_id AND sp.slug = 'tactical'
WHERE f.is_active = TRUE
ORDER BY COALESCE(lp.in_stock, FALSE) DESC, fs.score DESC
LIMIT 10;
```

## Frontend Coordination Notes

**For W1-02 (Frontend Hero Badge)**:

The API now exposes these fields for frontend use:
- `flashlight.amazon_in_stock` (boolean) - Stock status of the product
- `alternate_in_stock` (object, optional) - The top in-stock pick when #1 is OOS

**Suggested Frontend Implementation**:
```tsx
{ranking.flashlight.amazon_in_stock === false && ranking.alternate_in_stock && (
  <div className="stock-alert">
    <p>Current #1 is out of stock</p>
    <div className="alternate-badge">
      <span className="badge">Top In-Stock Pick</span>
      <ProductCard {...ranking.alternate_in_stock} />
    </div>
  </div>
)}
```

## Known Limitations

1. **Stock Data Freshness**: Stock status is based on the most recent price snapshot in the database. If Amazon sync is delayed, stock status may be stale (typically refreshed within 5-7 days per the sync schedule).

2. **Null Stock Handling**: Products without any price snapshots will have `amazon_in_stock: null` and are treated as OOS (demoted). This is conservative - better to show a potentially available product lower in the list than to promote an unknown-stock product.

3. **Alternate Calculation**: The alternate is only calculated for rank #1 on page 1. Other paginated results or lower-ranked OOS items do not get alternates (to avoid excessive DB queries).

4. **Use Case Scope**: The alternate is scoped to the same use case (e.g., tactical alternate for tactical #1). Cross-category alternates are not provided.

## Rollback Plan

If issues arise:
1. Revert the three modified functions in `internal/api/repository.go`:
   - `rankings()` - remove stock-based sorting
   - `listFlashlights()` - remove stock-based sorting
   - `findInStockAlternate()` - delete entire function
2. Revert type additions in `internal/api/server.go`:
   - Remove `alternate_in_stock` from `rankedResponse`
   - Remove `alternateInStock` type definition
3. Deploy reverted code
4. API will return to original score-only ranking

**No database migrations required** - this change is purely API logic.
