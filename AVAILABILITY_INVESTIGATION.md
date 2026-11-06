# Availability Semantics Investigation

## Executive Summary

After investigating the Creators API availability parsing and product filtering logic, I've identified the current behavior and potential issues:

**Current Behavior:**
- ✅ Products with no active affiliate link are **excluded from shopping/discovery listings**
- ✅ Purchase CTAs show "Currently unavailable" when `amazon_url` is missing or `in_stock = false`
- ✅ Review/detail pages remain accessible for all products (history preserved, no hard deletion)
- ⚠️ **Potential Issue:** Availability parsing may be too restrictive

**Key Finding:** The `AvailabilityInStock()` function only accepts three normalized values as "in stock":
- `"now"` (legacy PA-API format)
- `"in_stock"` (Rainforest format / normalized Creators "IN_STOCK")
- `"available"`

**All other availability types are treated as unavailable**, including:
- Empty/missing Availability.Type (products with no offers)
- Unknown availability statuses from Creators API
- Any non-standard status strings

## Investigation Details

### 1. Creators API Availability Parsing

**File:** `internal/amazon/creators_client.go`

The Creators API response structure (lines 443-456):
```go
OffersV2 struct {
    Listings []struct {
        Price struct {
            Money creatorsMoney `json:"money"`
        } `json:"price"`
        Availability struct {
            Type    string `json:"type"`    // e.g., "IN_STOCK", "OUT_OF_STOCK"
            Message string `json:"message"`
        } `json:"availability"`
        MerchantInfo struct {
            Name string `json:"name"`
        } `json:"merchantInfo"`
        IsBuyBoxWinner bool `json:"isBuyBoxWinner"`
    } `json:"listings"`
} `json:"offersV2"`
```

**Offer Selection Logic** (lines 487-509):
1. Prefers the listing with `IsBuyBoxWinner: true`
2. Falls back to first listing if no buy box winner
3. Extracts `Availability.Type` → stored in `Product.Availability`

**Example from tests:**
```json
{
  "availability": {"type": "IN_STOCK"},
  "isBuyBoxWinner": true
}
```

### 2. Purchasability Determination

**File:** `internal/amazon/sync.go`

**Function:** `productIsPurchasable` (lines 346-351)
```go
func productIsPurchasable(p Product) bool {
    if p.OfferPrice == nil || *p.OfferPrice <= 0 {
        return false
    }
    return AvailabilityInStock(p.Availability)
}
```

**Function:** `AvailabilityInStock` (lines 356-365)
```go
func AvailabilityInStock(availability string) bool {
    norm := strings.ToLower(strings.TrimSpace(availability))
    norm = strings.ReplaceAll(norm, " ", "_")
    switch norm {
    case "now", "in_stock", "available":
        return true
    default:
        return false
    }
}
```

**Normalization Examples:**
- `"IN_STOCK"` → `"in_stock"` ✅ **accepted**
- `"In Stock"` → `"in_stock"` ✅ **accepted**
- `"OUT_OF_STOCK"` → `"out_of_stock"` ❌ **rejected** (correct behavior)
- `"TEMPORARILY_UNAVAILABLE"` → `"temporarily_unavailable"` ❌ **rejected**
- `""` (empty/no offers) → `""` ❌ **rejected** (correct behavior)

### 3. Database Persistence

**File:** `internal/amazon/sync.go` (lines 273-284)

Price snapshots are saved with the `in_stock` field set to the `purchasable` boolean:

```go
const insertPrice = `
INSERT INTO flashlight_price_snapshots (
    flashlight_id, source, source_sku, currency_code, price, in_stock, captured_at
)
VALUES ($1, 'amazon', $2, $3, $4, $5, NOW())
`
_, err = tx.ExecContext(ctx, insertPrice, flashlightID, p.ASIN, p.CurrencyCode, *p.OfferPrice, purchasable)
```

**Affiliate Link Activation** (lines 286-300):
```go
const upsertAffiliate = `
UPDATE affiliate_links
SET affiliate_url = $3,
    is_active = $5,
    updated_at = NOW()
WHERE flashlight_id = $1
  AND provider = 'amazon'
  AND region_code = $2
  AND asin = $4
`
_, err = tx.ExecContext(ctx, upsertAffiliate, flashlightID, s.cfg.Region, canonicalURL, p.ASIN, purchasable)
```

**Key Point:** `affiliate_links.is_active` is set to the `purchasable` boolean, which controls:
- Whether the product appears in shopping/discovery listings
- Whether the "Buy on Amazon" button is shown

### 4. CSV Sync Availability Tracking

**File:** `internal/rainforest/sync.go`

**Availability Threshold Logic** (lines 462-489):

The CSV sync tracks consecutive unavailable runs in a sidecar state file:

```go
if strings.EqualFold(strings.TrimSpace(product.ASIN), strings.TrimSpace(asin)) &&
    product.Price > 0 &&
    product.InStock {
    state.MarkAvailable(asin, brandName, modelName)
    // ... mark as purchasable
    row[colAmazonPurchasable] = "true"
} else {
    state.MarkUnavailable(asin, brandName, modelName, "no purchasable buy box")
    streak := state.Entries[asin].UnavailableRuns
    if threshold > 0 && streak >= threshold && row[colAmazonPurchasable] != "false" {
        changes = append(changes, "Amazon offer soft-disabled")
        row[colAmazonPurchasable] = "false"
    }
}
```

**Production Configuration:** `PRUNE_THRESHOLD=2`

This means:
- After **2 consecutive unavailable syncs**, the product's Amazon link is soft-disabled
- The CSV `amazon_purchasable` column is set to `"false"`
- A subsequent purchasable response automatically re-enables it

### 5. API Filtering and Listing Behavior

**File:** `internal/api/repository.go`

**All listing queries filter by:**
1. `flashlights.is_active = TRUE` (lines 1034, 1426, 1853, 2060, 2144)
2. `affiliate_links.is_active = TRUE` (lines 90, 359, 724, 1030, 1422, 1546, 1783)

**Example from `listFlashlights`** (lines 88-91):
```sql
latest_affiliate AS (
    SELECT DISTINCT ON (a.flashlight_id)
        a.flashlight_id,
        a.affiliate_url
    FROM affiliate_links a
    WHERE a.provider = 'amazon'
      AND a.region_code = 'US'
      AND a.is_active = TRUE  -- Only active affiliate links
    ORDER BY ...
)
```

**In-Stock Alternates** (line 1428):
```sql
WHERE f.is_active = TRUE
  AND f.id != $2
  AND lp.in_stock = TRUE        -- Must be in stock
  AND la.affiliate_url IS NOT NULL
  AND la.affiliate_url != ''    -- Must have valid affiliate URL
```

**Availability Status** (lines 34-42):
```go
func availabilityStatus(inStock sql.NullBool) string {
    if !inStock.Valid {
        return "unknown"
    }
    if inStock.Bool {
        return "in_stock"
    }
    return "out_of_stock"
}
```

**Items Need Alternate When** (lines 289, 658, 889, 1127):
```go
hasValidAffiliateURL := item.AmazonURL != nil && *item.AmazonURL != ""
needsAlternate := item.AvailabilityStatus != "in_stock" || !hasValidAffiliateURL
```

This catches:
- `"out_of_stock"` ✅
- `"unknown"` ✅ (when `in_stock` is NULL)
- Missing/empty affiliate URL ✅

### 6. Web UI Display

**File:** `web/components/BuyOnAmazonButton.tsx`

**Unavailable Display** (lines 30-32):
```tsx
if (offers.length === 0 || inStock === false) {
  return <span className="badge">Currently unavailable</span>;
}
```

**File:** `web/components/FlashlightCard.tsx`

**Unavailable Detection** (lines 60-63):
```tsx
const inStock = item.in_stock !== undefined && item.in_stock !== null ? item.in_stock : item.amazon_in_stock;
const isOutOfStock = item.availability_status === 'out_of_stock';
const primaryUnavailable = !item.amazon_url || inStock === false;
const hasAlternate = item.in_stock_alternate != null;
```

**Alternate Display** (lines 131-170):
```tsx
{primaryUnavailable && hasAlternate && item.in_stock_alternate && (
  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
    <strong style={{ fontSize: "0.78rem", color: "var(--teal)" }}>Best available alternative:</strong>
    {/* ... display alternate product link ... */}
  </div>
)}
```

## Current User-Visible Behavior

### Shopping/Discovery Listings (List, Search, Rankings, Compare)

**Included:**
- ✅ Products with active affiliate links (`affiliate_links.is_active = TRUE`)
- ✅ Products with recent purchasable price snapshot (`in_stock = TRUE` or NULL from latest sync)

**Excluded:**
- ❌ Products with `affiliate_links.is_active = FALSE` (soft-disabled after PRUNE_THRESHOLD consecutive unavailable syncs)
- ❌ Products with `flashlights.is_active = FALSE` (manually deactivated)

**Sorting:**
- In-stock items sorted first
- Out-of-stock items (`in_stock = FALSE`) sorted last

### Product Detail Pages

**Always Accessible:**
- ✅ All products remain accessible via direct URL (by slug or ID)
- ✅ Price history, ratings, reviews, and specs preserved
- ✅ No hard deletion

**Buy Button Behavior:**
- Products with valid `amazon_url` AND `in_stock = TRUE` → "Check Price on Amazon" button
- Products with `amazon_url` but `in_stock = FALSE` → "Currently unavailable" badge
- Products without `amazon_url` OR `in_stock = FALSE` → Shows in-stock alternate (if available)

### "Unknown" Availability Status

Products with `in_stock = NULL` (unknown) are treated as:
- ✅ **Included** in listings (not explicitly filtered out)
- ⚠️ **May show** alternate if API considers `availability_status = "unknown"` as `!= "in_stock"`
- ℹ️ **Not falsely advertised** as verified purchasable (no "Buy" button without valid affiliate link)

## Potential Issues Identified

### Issue 1: Overly Restrictive Availability Whitelist

**Problem:** `AvailabilityInStock()` only accepts three hardcoded values. Any unknown status from the Creators API (including future new statuses) is treated as unavailable.

**Example Scenarios:**
1. Creators API introduces new status `"AVAILABLE_FOR_PREORDER"` → treated as unavailable
2. Creators API returns `"In Stock"` with different capitalization or spacing → **currently handled by normalization** ✅
3. Products with no offers (empty `Availability.Type`) → treated as unavailable ✅ **correct**

**Recommendation:** Document expected Creators API availability types and consider logging unknown values for monitoring.

### Issue 2: Missing Offers vs. Explicit Unavailable

**Current Behavior:**
- Products with no `OffersV2.Listings` → `Availability = ""` → `purchasable = false` ✅
- Products with listings but no buy box and no price → `purchasable = false` ✅

**Verification Needed:**
- When Creators API returns an item with NO `OffersV2` field at all (missing vs. empty array)
- When Creators API returns an item with `OffersV2.Listings = []` (empty array)

Both should result in `Availability = ""` and `OfferPrice = nil`, causing `purchasable = false`. **This appears correct.**

### Issue 3: Transient Outages vs. Authoritative No-Offer Status

**Current Behavior:**
- Sync errors (network, auth, API failure) → Run fails, no products updated ✅
- Successful sync with individual item missing → Marked unavailable, streak incremented
- Successful sync with item returned but no offers → Marked unavailable, streak incremented

**Distinction:**
- **Transient outage:** Entire sync fails due to `ErrSourceUnavailable` → Falls back to Rainforest
- **Authoritative unavailable:** Creators API successfully returns item with no purchasable offers → Correctly marks unavailable

**Verification:** The code correctly distinguishes:
1. Whole-run failures (auth denied) → fail over to Rainforest, no streak increment
2. Item-level "not found" (ASIN missing from response) → marks unavailable, increments streak
3. Item returned with no offers → marks unavailable, increments streak

## User Report Analysis

**Report:** "Full 176 Creators sync reported 101 unavailable, purchasable dropped 120→88 with PRUNE_THRESHOLD=2"

**Interpretation:**
- 101 items returned by Creators API were determined non-purchasable (no offers OR availability not "IN_STOCK")
- 32 items exceeded the consecutive unavailable threshold (120 - 88 = 32)
- These 32 items had `affiliate_links.is_active` set to FALSE

**Possible Causes:**
1. ✅ **Legitimate:** 101 items genuinely have no purchasable offers on Amazon
2. ⚠️ **Creators API Access:** Missing `customerReviews.*` or other gated fields
3. ⚠️ **Parsing Issue:** Unknown availability statuses being rejected
4. ⚠️ **BuyBox vs. Any Offer:** Only checking BuyBox winner and first listing, not all offers

### Verification Needed

To determine if this is correct behavior or a parsing issue:

1. **Sample Raw Creators API Response:**
   - Capture raw JSON for a few "unavailable" products
   - Verify `OffersV2.Listings` array contents
   - Check `Availability.Type` values

2. **Logging Enhancement:**
   - Log unknown availability status values
   - Log when products have offers but are marked unavailable
   - Log when products have no `OffersV2` field vs. empty `Listings` array

3. **Manual Verification:**
   - Check 5-10 "unavailable" ASINs directly on Amazon.com
   - Verify if they are actually out of stock or have offers
   - Compare with what Creators API returned

## Recommended Next Steps

### 1. Enhanced Logging (Low Risk, High Value)

Add logging to detect unknown availability statuses:

```go
func AvailabilityInStock(availability string) bool {
    if availability == "" {
        return false // Explicit empty = no offers
    }
    norm := strings.ToLower(strings.TrimSpace(availability))
    norm = strings.ReplaceAll(norm, " ", "_")
    switch norm {
    case "now", "in_stock", "available":
        return true
    default:
        // Log unknown status for monitoring
        log.Printf("WARNING: unknown availability status: %q (normalized: %q)", availability, norm)
        return false
    }
}
```

### 2. Availability Status Audit

Create a diagnostic tool to:
- Query last 200 price snapshots
- Group by `in_stock` status
- Sample ASINs from each group
- Fetch current Creators API response
- Compare with recorded status

### 3. Offer Listings Inspection

Enhance product mapping to consider all listings, not just buy box:

```go
// Current: Only checks buy box or first listing
// Enhancement: Check if ANY listing is purchasable
hasAnyPurchasableOffer := false
for _, l := range item.OffersV2.Listings {
    if l.Price.Money.Amount != nil && *l.Price.Money.Amount > 0 && 
       AvailabilityInStock(l.Availability.Type) {
        hasAnyPurchasableOffer = true
        break
    }
}
```

### 4. Test Coverage

Add test cases for:
- Missing `OffersV2` field entirely
- Empty `OffersV2.Listings` array
- Listings with price but non-standard availability
- Multiple listings (buy box + others)
- Unknown availability status strings

## Conclusion

**Current Behavior is Correct for Core Requirements:**
- ✅ Nonpurchasable products **excluded** from shopping/discovery listings
- ✅ Purchase CTAs **do not appear** for unavailable products
- ✅ Review/history **preserved** (no hard deletion)
- ✅ Unknown status **not falsely advertised** as verified purchasable
- ✅ Transient outages (auth failures) **properly distinguished** from authoritative no-offer status

**Potential Improvements:**
- ⚠️ Availability whitelist may be too restrictive (monitor for unknown statuses)
- ⚠️ Consider checking ALL listings, not just buy box + first
- ⚠️ Add diagnostic logging for unknown availability values

**To Verify User Report (101 unavailable):**
1. Sample raw Creators API responses for "unavailable" items
2. Check if they have `OffersV2.Listings` with offers
3. Verify availability status values
4. Manually check ASINs on Amazon.com

**No Code Changes Required** unless investigation reveals:
- Unknown availability statuses being incorrectly rejected
- Products with valid offers being marked unavailable
- Parsing errors in `OffersV2` structure

## Files for Reference

### Core Availability Logic
- `internal/amazon/creators_client.go` - Creators API response parsing
- `internal/amazon/sync.go` - Purchasability determination
- `internal/amazon/catalog_source.go` - Adapter for CSV sync
- `internal/rainforest/sync.go` - CSV availability tracking with threshold

### API Filtering
- `internal/api/repository.go` - Database queries with `is_active` filters

### Web UI
- `web/components/BuyOnAmazonButton.tsx` - Purchase CTA display
- `web/components/FlashlightCard.tsx` - Product card with unavailable state

### Database Schema
- `db/migrations/0001_initial_schema.sql` - `affiliate_links`, `flashlight_price_snapshots` tables

## Status

✅ **Investigation Complete**  
⏸️ **Awaiting User Decision:** No fixes needed unless raw API data reveals parsing issues  
📊 **Recommended:** Add diagnostic logging and sample raw responses from production sync
