# FLR-QA-01 Follow-up Acceptance Tests

## Summary
This document describes the acceptance tests for the FLR-QA-01 follow-up fixes that address:
1. Category list API returning OOS items with null alternates
2. Missing lumen filter on category lists
3. Overall rankings recommending specialty (penlight/keychain/toy) items as alternates

## Changes Made

### 1. Lumen Filter on List Endpoint
**File**: `internal/api/repository.go` - `listFlashlights()`
- Added `max_lumens >= 100` filter when `use_case` filter is present
- Exception: specialty use cases (penlight, keychain, toy) bypass the filter
- Prevents low-lumen items (e.g., cloud-defensive-rein-micro with 1 lumen) from appearing on weapon-mount/edc lists

### 2. Backend Demotion of OOS Without Alternates
**File**: `internal/api/repository.go` - `listFlashlights()`
- Over-fetch 3x the page size to allow filtering
- For each OOS or null amazon_url item:
  - Try to find alternate using the **requested use_case** (not hardcoded "overall")
  - If alternate found, include item in results with `in_stock_alternate` populated
  - If no alternate found, **exclude item from results** (backend demotion)
- In-stock items always included

### 3. Overall Rankings Alt Ladder Improvement
**File**: `internal/api/repository.go` - `rankings()`
- When `use_case=overall` and item is OOS:
  - Look up the item's primary (highest confidence) use_case
  - Use that use_case for the alt ladder (unless it's specialty)
  - Prevents recommending penlight/keychain/toy as alternates for tactical/weapon-mount items

### 4. Helper Functions Added
- `getFlashlightPrimaryUseCase(ctx, flashlightID)`: Fetches highest-confidence use_case for a flashlight
- `isSpecialtyUseCase(useCase)`: Returns true for penlight, keychain, toy

## Acceptance Tests

### Test 1: Weapon-Mount List No Longer Returns OOS Without Alternates

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=weapon-mount&page_size=50" | jq '.items[] | select(.availability_status == "out_of_stock") | {id, name, slug, amazon_url, in_stock_alternate}'
```

**Expected**:
- All OOS items have non-null `in_stock_alternate`
- No items with both null `amazon_url` and null `in_stock_alternate`
- Previously problematic items (streamlight-protac-rm-hlx, cloud-defensive-owl, surefire-m640-u-pro, cloud-defensive-rein-df, surefire-x300-ultra, cloud-defensive-rein-micro) either:
  - Have `in_stock_alternate` populated with a weapon-mount or tactical sibling
  - Are not in the returned list (backend demoted)

### Test 2: Low-Lumen Items Excluded From Weapon-Mount List

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=weapon-mount&page_size=50" | jq '.items[] | select(.max_lumens != null and .max_lumens < 100) | {id, name, slug, max_lumens, use_case_tags}'
```

**Expected**:
- Empty result set (no items with max_lumens < 100)
- Specifically, `cloud-defensive-rein-micro` (1 lumen) should NOT appear

### Test 3: EDC List Applies Lumen Filter

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=edc&page_size=50" | jq '.items[] | select(.max_lumens != null and .max_lumens < 100) | {id, name, slug, max_lumens}'
```

**Expected**:
- Empty result set

### Test 4: Penlight List Bypasses Lumen Filter

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=penlight&page_size=50" | jq '.items[] | select(.max_lumens != null and .max_lumens < 100) | {id, name, slug, max_lumens}'
```

**Expected**:
- May return items with max_lumens < 100 (specialty use case exemption)
- Penlight items are expected to have lower lumen output

### Test 5: Overall Rankings Don't Recommend Specialty Alts

**Request**:
```bash
curl -s "http://localhost:8080/api/rankings?use_case=overall&page_size=50" | jq '.items[] | select(.in_stock_alternate != null) | {flashlight: {id: .flashlight.id, name: .flashlight.name, use_case_tags: .flashlight.use_case_tags}, alternate: {id: .in_stock_alternate.id, name: .in_stock_alternate.name}}'
```

**Manual Verification**:
- For OOS weapon-mount items in overall rankings, alternates should be weapon-mount or tactical items
- Should NOT see `coast-g20` (penlight) as alternate for weapon-mount items
- Alternates should be from the same or related use_case family

### Test 6: Weapon-Mount List Uses Weapon-Mount Alt Ladder

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=weapon-mount&page_size=50" | jq '.items[] | select(.in_stock_alternate != null) | {source: {id, name, use_case_tags}, alternate: {id: .in_stock_alternate.id, name: .in_stock_alternate.name}}'
```

**Expected**:
- All alternates should be weapon-mount or tactical items (family fallback)
- No penlight, keychain, or toy items as alternates

### Test 7: Affiliate Tag Preserved

**Request**:
```bash
curl -s "http://localhost:8080/api/flashlights?use_case=weapon-mount&page_size=10" | jq '.items[0].in_stock_alternate.affiliate_url'
```

**Expected**:
- If alternate present, `affiliate_url` should contain `flashlightrat-20` tag
- Tag should never be stripped

### Test 8: Count Accuracy Check

**Request**:
```bash
# Get total count
TOTAL=$(curl -s "http://localhost:8080/api/flashlights?use_case=weapon-mount&page_size=1" | jq '.total')
echo "Total weapon-mount items: $TOTAL"

# Compare to DB count (requires DB access)
# SELECT COUNT(*) FROM flashlights f
# JOIN flashlight_use_cases fuc ON fuc.flashlight_id = f.id
# JOIN use_cases u ON u.id = fuc.use_case_id
# LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
# WHERE f.is_active = TRUE
#   AND u.slug = 'weapon-mount'
#   AND (s.max_lumens IS NULL OR s.max_lumens >= 100);
```

**Expected**:
- Total count should reflect items that pass the lumen filter
- Should be less than or equal to raw count of all weapon-mount items

## Implementation Verification

### Code Review Checklist

- [x] Lumen filter added to `listFlashlights` with specialty use_case bypass
- [x] Over-fetch pattern (3x page size) implemented in `listFlashlights`
- [x] Backend demotion of OOS without alternates implemented
- [x] Use requested use_case for alt ladder (not hardcoded "overall")
- [x] Overall rankings look up item's primary use_case for alt ladder
- [x] `getFlashlightPrimaryUseCase` helper added with proper SQL query
- [x] `isSpecialtyUseCase` helper added
- [x] No changes to field names (`in_stock_alternate` preserved)
- [x] Affiliate tag handling unchanged (never stripped)

### Git History

```bash
git log --oneline -1
# Should show: FLR-QA-01 follow-up: Fix category list API alt ladder and lumen filter
```

## Test Execution Log

### Local Test (Docker)

```bash
# Start services
./scripts/dev-up.sh

# Wait for services to be ready
docker compose logs -f --tail=100

# Run acceptance tests
./test-flr-qa-01-followup.sh
```

### CI Test

CI should run API smoke tests that include:
- `/api/flashlights?use_case=weapon-mount` endpoint
- Verify no OOS items without alternates
- Verify no low-lumen items on non-specialty use_case lists

## Known Issues and Edge Cases

### Edge Case 1: All Candidates Are OOS Without Alternates
- If first 3x page_size items are all OOS without alternates, result will be fewer than page_size items
- This is expected behavior (better than showing broken items)

### Edge Case 2: Sparse Use Cases (weapon-mount)
- Weapon-mount is a sparse use case with limited inventory
- Alt ladder will fall back to tactical family
- Some items may still be excluded if neither weapon-mount nor tactical alternates are available

### Edge Case 3: Primary Use Case Is Specialty
- If item's primary use_case is penlight/keychain/toy in overall rankings
- Alt ladder falls back to "overall" use_case
- This prevents specialty items recommending other specialty items

## Rollback Plan

If issues are discovered after deployment:

```bash
git revert e42c82f
git push origin cursor/flr-qa-01-followup-5057

# Or reset to previous commit
git reset --hard 91b4e68
git push origin cursor/flr-qa-01-followup-5057 --force
```

## Sign-off

- [ ] All acceptance tests pass locally
- [ ] CI tests pass
- [ ] PM verified weapon-mount category page shows no OOS without alternates
- [ ] PM verified no low-lumen items on weapon-mount/edc lists
- [ ] PM verified overall rankings don't recommend penlight as alts for tactical items
