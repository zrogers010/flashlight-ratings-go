# W1-01: Availability-Aware Ranking Verification

## API Contract (Locked for Frontend)

### Per-Flashlight Fields

All flashlight responses (rankings, lists, detail) include:

- **`in_stock`**: `boolean | null`  
  Raw value from latest `flashlight_price_snapshots.in_stock`. `null` when no price snapshot exists.

- **`availability_status`**: `'in_stock' | 'out_of_stock' | 'unknown'`  
  Derived enum:
  - `in_stock`: `in_stock === true`
  - `out_of_stock`: `in_stock === false`
  - `unknown`: `in_stock === null`

### Ranking-Specific Fields

Ranking endpoints (`/rankings`) include additional fields:

- **`rank_position`**: `number`  
  Availability-aware rank using stable partition: (in-stock + unknown) before out-of-stock, then by score descending.

- **`rank_position_raw`**: `number`  
  Score-only rank (ignoring stock status). Shows what the rank would be without demotion.

- **`in_stock_alternate`**: `object | null`  
  Present when `availability_status === 'out_of_stock'`. Contains the highest-ranked in-stock product in the same use case.
  
  Structure:
  ```typescript
  {
    id: number;
    slug: string;
    name: string;
    brand_name: string;
    score?: number;
    rank_position?: number;
    affiliate_url?: string;
    image_url?: string;
  }
  ```

### Meta Fields

- **`total`** / **`flashlight_count`**: Real active flashlight count from DB (≥178), not hardcoded

## Changes Summary

### 1. Ranking Logic Update
**File**: `internal/api/repository.go` - `rankings()` function

**Sort Key** (new - stable partition):
```sql
ORDER BY
  CASE WHEN lp.in_stock = FALSE THEN 1 ELSE 0 END ASC,  -- OOS last; in-stock + unknown first
  COALESCE(fs.score, 0) DESC,                           -- Then by score
  f.id ASC                                               -- Tie-breaker
```

**Behavior**:
- **In-stock + unknown** products rank before **out-of-stock** products
- Within each group, products sorted by score descending
- OOS products demoted but NOT removed from catalog
- Both `rank_position` (availability-aware) and `rank_position_raw` (score-only) included

### 2. In-Stock Alternate Exposure
**Files**: `internal/api/server.go`, `internal/api/repository.go`

**Change**: When a product is OOS, the API includes `in_stock_alternate` with the highest-ranked in-stock peer.

**Response Example**:
```json
{
  "rank_position": 1,
  "rank_position_raw": 1,
  "score": 92.5,
  "flashlight": {
    "id": 123,
    "brand": "Olight",
    "name": "Warrior X Pro",
    "in_stock": false,
    "availability_status": "out_of_stock",
    ...
  },
  "in_stock_alternate": {
    "id": 456,
    "slug": "streamlight-protac-hl-x",
    "name": "ProTac HL-X",
    "brand_name": "Streamlight",
    "score": 89.2,
    "rank_position": 2,
    "image_url": "...",
    "affiliate_url": "..."
  }
}
```

**Behavior**:
- Set for ANY product with `availability_status === 'out_of_stock'` (not just rank #1)
- Contains highest-ranked in-stock product from same use case
- Frontend can badge this as "Top In-Stock Pick"

### 3. General Listing Update
**File**: `internal/api/repository.go` - `listFlashlights()` function

**Change**: The `/flashlights` endpoint now also demotes OOS products in all sort modes.

**Sort Key** (updated - stable partition):
```sql
ORDER BY
  CASE WHEN lp.in_stock = FALSE THEN 1 ELSE 0 END ASC,  -- OOS last; in-stock + unknown first
  {user_sort_expr} {ASC|DESC},                          -- Then user's chosen sort
  f.id ASC                                               -- Tie-breaker
```

**Behavior**:
- Works with all existing sort parameters: `sort_by=overall_score`, `sort_by=price`, `sort_by=max_lumens`, etc.
- In-stock + unknown products appear before OOS, regardless of sort field
- User's chosen sort order respected within each availability group

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
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=20' | jq '.items[] | {
  rank_position,
  rank_position_raw,
  brand: .flashlight.brand,
  name: .flashlight.name,
  availability_status: .flashlight.availability_status,
  score
}'
```

**Expected**:
- All items with `availability_status: "in_stock"` or `"unknown"` appear before `"out_of_stock"`
- Within in-stock+unknown group: scores descending (`rank_position_raw` order)
- Within OOS group: scores descending
- `rank_position` is sequential: 1, 2, 3, ...
- `rank_position_raw` shows score-only rank (may differ from `rank_position` for OOS items)

#### 2. Verify Alternate Exposure for OOS Items
```bash
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=10' | jq '.items[] | select(.flashlight.availability_status == "out_of_stock") | {
  rank_position,
  brand: .flashlight.brand,
  name: .flashlight.name,
  in_stock_alternate
}'
```

**Expected**:
- Any item with `availability_status: "out_of_stock"` has `in_stock_alternate` object
- Alternate contains: `id`, `slug`, `name`, `brand_name`, `score`, `rank_position`, `affiliate_url`, `image_url`
- Alternate's `rank_position` should be lower than or equal to the OOS item's `rank_position_raw`

#### 3. Verify OOS Demotion in General Listing
```bash
curl 'http://localhost:8080/flashlights?page=1&page_size=20&sort_by=overall_score&order=desc' | jq '.items[] | {
  id,
  brand,
  name,
  availability_status,
  score: .overall_score
}'
```

**Expected**:
- Items with `availability_status: "in_stock"` or `"unknown"` appear first
- Items with `availability_status: "out_of_stock"` appear last
- User's sort order (overall_score DESC) respected within each availability group

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

1. **Stock Status**:
   - `in_stock`: `boolean | null` (raw DB value)
   - `availability_status`: `'in_stock' | 'out_of_stock' | 'unknown'` (derived enum)

2. **Ranking**:
   - `rank_position`: availability-aware rank
   - `rank_position_raw`: optional score-only rank (for comparison)

3. **Alternate**:
   - `in_stock_alternate`: object when item is OOS, containing top in-stock peer

**Suggested Frontend Implementation**:
```tsx
{ranking.flashlight.availability_status === 'out_of_stock' && ranking.in_stock_alternate && (
  <div className="stock-alert">
    <div className="oos-notice">
      <span className="badge badge-warning">Out of Stock</span>
      {ranking.rank_position_raw && (
        <span className="rank-note">
          (Would be #{ranking.rank_position_raw} if available)
        </span>
      )}
    </div>
    <div className="alternate-badge">
      <span className="badge badge-success">Top In-Stock Pick</span>
      <ProductCard
        id={ranking.in_stock_alternate.id}
        slug={ranking.in_stock_alternate.slug}
        name={ranking.in_stock_alternate.name}
        brand={ranking.in_stock_alternate.brand_name}
        score={ranking.in_stock_alternate.score}
        rank={ranking.in_stock_alternate.rank_position}
        imageUrl={ranking.in_stock_alternate.image_url}
        affiliateUrl={ranking.in_stock_alternate.affiliate_url}
      />
    </div>
  </div>
)}

{ranking.flashlight.availability_status === 'unknown' && (
  <div className="stock-notice">
    <span className="badge badge-neutral">Availability Unknown</span>
    <small>Check retailer for current stock</small>
  </div>
)}
```

## Known Limitations

1. **Stock Data Freshness**: Stock status is based on the most recent price snapshot in the database. If Amazon sync is delayed, stock status may be stale (typically refreshed within a few hours on the ~3×/day sync schedule).

2. **Unknown Stock Handling**: Products without any price snapshots will have `in_stock: null` and `availability_status: "unknown"`. These are **NOT demoted** - they rank with in-stock products (stable partition groups in-stock + unknown together). This prevents demoting products that may actually be available but haven't been synced recently.

3. **Alternate Calculation**: The alternate is calculated for **any** OOS item in the response (not just rank #1). This allows Frontend to display alternates throughout paginated results. Alternates are only fetched when needed (item is OOS) to avoid excessive queries.

4. **Use Case Scope**: The alternate is scoped to the same use case (e.g., tactical alternate for tactical rankings). Cross-category alternates are not provided.

5. **Alternate Uniqueness**: Each OOS item gets its own alternate lookup, so multiple OOS items may share the same alternate (the top in-stock product) in their responses.

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
