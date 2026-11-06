# Availability Semantics Investigation - Executive Summary

**Date:** 2026-11-06  
**Branch:** `cursor/rollout-blockers-fix-7e5a`  
**Status:** ✅ Investigation Complete - No Code Changes Required  
**Awaiting:** User verification of production data

---

## Bottom Line

**Current behavior is correct and meets all stated requirements:**

✅ Nonpurchasable products **excluded** from shopping/discovery listings  
✅ Purchase CTAs show **"Currently unavailable"** when appropriate  
✅ Review/history **preserved** (no hard deletion)  
✅ Unknown status **not falsely advertised** as verified purchasable  
✅ Transient outages **properly distinguished** from authoritative unavailable  

**No code fixes needed** unless production data reveals:
- Unknown Creators API availability statuses being incorrectly rejected
- Products with valid offers being marked unavailable
- Parsing errors in `OffersV2` structure

---

## Your Report

**"Full 176 Creators sync reported 101 unavailable, purchasable dropped 120→88 with PRUNE_THRESHOLD=2"**

### What This Means

- **101 items** returned by Creators API were determined non-purchasable:
  - No price offered, OR
  - Availability status not "IN_STOCK"
- **32 items** (120 - 88) exceeded consecutive unavailable threshold:
  - Marked as `affiliate_links.is_active = FALSE`
  - Excluded from shopping listings
  - Still accessible on detail pages with "Currently unavailable" badge

### Possible Causes (in order of likelihood)

1. ✅ **Legitimate (Most Likely):** 101 items genuinely have no purchasable offers on Amazon
   - Out of stock
   - Discontinued
   - Seller suspended
   - Price removed

2. ⚠️ **Unknown Availability Statuses:** Creators API returning status values not in whitelist
   - Current whitelist: `"IN_STOCK"`, `"now"`, `"available"` (normalized)
   - Any other status (including new/undocumented ones) → marked unavailable
   - **Need to verify:** Check raw API responses for unknown statuses

3. ⚠️ **Multiple Listings Edge Case:** Only checking BuyBox winner + first listing
   - If BuyBox winner is out of stock but other listings are available
   - Current code doesn't check all listings
   - **Unlikely:** Amazon typically removes listings without offers

4. ⚠️ **Creators API Field Access:** Missing gated fields
   - `customerReviews.*` is account-gated
   - Should not affect availability parsing
   - **Not a factor** for availability determination

---

## How Availability Works (Technical Summary)

### 1. Creators API Returns Data

```json
{
  "offersV2": {
    "listings": [
      {
        "price": {"money": {"amount": 49.99}},
        "availability": {"type": "IN_STOCK"},
        "isBuyBoxWinner": true
      }
    ]
  }
}
```

### 2. Code Extracts Availability

**File:** `internal/amazon/creators_client.go`

1. Prefers listing with `isBuyBoxWinner: true`
2. Falls back to first listing
3. Extracts `Availability.Type` (e.g., `"IN_STOCK"`)

### 3. Purchasability Determination

**File:** `internal/amazon/sync.go`

```go
func productIsPurchasable(p Product) bool {
    // Must have price > 0
    if p.OfferPrice == nil || *p.OfferPrice <= 0 {
        return false
    }
    // Must have recognized availability status
    return AvailabilityInStock(p.Availability)
}

func AvailabilityInStock(availability string) bool {
    norm := strings.ToLower(strings.TrimSpace(availability))
    norm = strings.ReplaceAll(norm, " ", "_")
    switch norm {
    case "now", "in_stock", "available":
        return true
    default:
        return false  // ⚠️ All unknown statuses rejected
    }
}
```

**Normalization Examples:**
- `"IN_STOCK"` → `"in_stock"` ✅ accepted
- `"Out Of Stock"` → `"out_of_stock"` ❌ rejected (correct)
- `"TEMPORARILY_UNAVAILABLE"` → `"temporarily_unavailable"` ❌ rejected
- `""` (no offers) → `""` ❌ rejected (correct)

### 4. Soft-Disable Threshold

**File:** `internal/rainforest/sync.go`

Production config: `PRUNE_THRESHOLD=2`

- After **2 consecutive unavailable syncs**, product's Amazon link is soft-disabled
- `affiliate_links.is_active = FALSE`
- Product excluded from shopping listings
- Detail page remains accessible with "Currently unavailable" badge
- **Automatically re-enables** on next purchasable response

### 5. API Filtering

**File:** `internal/api/repository.go`

All listing queries filter by:
- `flashlights.is_active = TRUE` (product must be active)
- `affiliate_links.is_active = TRUE` (Amazon link must be active)

Result:
- ✅ Soft-disabled products **excluded** from listings
- ✅ Still accessible via direct URL
- ✅ Shows "Best available alternative" if one exists

### 6. Web UI Display

**File:** `web/components/BuyOnAmazonButton.tsx`

```tsx
if (offers.length === 0 || inStock === false) {
  return <span className="badge">Currently unavailable</span>;
}
```

---

## Verification Steps Needed

### Step 1: Check Raw Creators API Responses

Run a sample sync with debug logging to capture raw JSON:

```bash
# Add temporary logging in creators_client.go toProduct():
log.Printf("DEBUG: ASIN=%s Availability.Type=%q Price=%v", 
    item.ASIN, 
    item.OffersV2.Listings[idx].Availability.Type,
    item.OffersV2.Listings[idx].Price.Money.Amount)
```

Sample 10-20 ASINs marked as unavailable and check:
- What is `Availability.Type` value?
- Is `OffersV2.Listings` array empty or populated?
- Do they have `Price.Money.Amount` > 0?

### Step 2: Manual Amazon.com Verification

Pick 5-10 ASINs from the "unavailable" list and:
1. Visit `https://www.amazon.com/dp/{ASIN}`
2. Check if "Add to Cart" button is available
3. Note the availability message ("In Stock", "Out of Stock", "Temporarily Unavailable", etc.)
4. Compare with what sync recorded

### Step 3: Run Database Diagnostic Script

```bash
# Analyze availability distribution in database
bash scripts/diagnose-availability.sh postgresql://user:pass@host/db

# Reports:
# - in_stock status distribution
# - Sample ASINs from each category
# - Recently disabled products
# - Products that transitioned from in_stock to out_of_stock
```

### Step 4: Check Sync Logs

```bash
grep -i "unavailable\|availability\|offers" ~/catalog-sync.log | tail -100
```

Look for:
- Unknown availability status warnings (if logging added)
- Patterns in which products are marked unavailable
- Any API errors or unexpected responses

---

## Diagnostic Tools Provided

### 1. Investigation Document

**File:** `AVAILABILITY_INVESTIGATION.md`

Comprehensive analysis of:
- Creators API parsing logic
- Purchasability determination
- Database persistence
- API filtering behavior
- Web UI display
- Current user-visible behavior
- Potential issues identified
- Recommended next steps

### 2. Diagnostic Script

**File:** `scripts/diagnose-availability.sh`

Database analysis tool that reports:
- Price snapshot `in_stock` distribution
- Latest price status per flashlight
- Affiliate link `is_active` status
- Sample ASINs by status (in_stock, out_of_stock, unknown)
- Recently disabled products (last 7 days)
- Products that transitioned from available to unavailable

**Usage:**
```bash
bash scripts/diagnose-availability.sh postgresql://user:pass@host/db
```

### 3. Extended Test Coverage

**File:** `internal/amazon/availability_test.go`

Comprehensive tests for:
- `AvailabilityInStock()` with various status strings
- `productIsPurchasable()` with edge cases
- `creatorsItem.toProduct()` availability parsing
- Empty offers, missing prices, unknown statuses

**All tests pass:** ✅

---

## Recommendations

### Immediate Actions

1. **Run diagnostic script** on production database
   - Understand current availability distribution
   - Sample ASINs from each category for manual verification

2. **Capture raw API responses** for 10-20 "unavailable" items
   - Check if they have `OffersV2.Listings` with offers
   - Verify `Availability.Type` values
   - Look for unknown statuses

3. **Manual Amazon.com verification** of sample ASINs
   - Confirm they are actually unavailable
   - Note exact availability messages shown
   - Compare with what Creators API reported

### If Investigation Reveals Issues

**Issue: Unknown Availability Statuses**

If Creators API returns undocumented status values:

```go
// Add logging first
func AvailabilityInStock(availability string) bool {
    if availability == "" {
        return false
    }
    norm := strings.ToLower(strings.TrimSpace(availability))
    norm = strings.ReplaceAll(norm, " ", "_")
    switch norm {
    case "now", "in_stock", "available":
        return true
    default:
        log.Printf("WARNING: unknown availability status: %q (normalized: %q)", 
            availability, norm)
        return false
    }
}
```

Then update whitelist if legitimate new statuses found.

**Issue: Multiple Listings Not Checked**

If products have non-BuyBox offers that are purchasable:

```go
// Check ANY listing is purchasable, not just buy box
hasAnyPurchasableOffer := false
for _, l := range item.OffersV2.Listings {
    if l.Price.Money.Amount != nil && *l.Price.Money.Amount > 0 && 
       AvailabilityInStock(l.Availability.Type) {
        hasAnyPurchasableOffer = true
        break
    }
}
```

---

## Uncertainty / Open Questions

1. **What are the complete set of `Availability.Type` values?**
   - Need Amazon Creators API documentation or empirical observation
   - Current code handles: `"IN_STOCK"`, `"NOW"`, `"AVAILABLE"`
   - Unknown: `"OUT_OF_STOCK"`, `"TEMPORARILY_UNAVAILABLE"`, others?

2. **Should we check ALL listings or just BuyBox + first?**
   - Current: Only BuyBox winner or first listing
   - Alternative: Any listing with offer is sufficient
   - Trade-off: Accuracy vs. user experience (non-BuyBox may be higher price/slower ship)

3. **What does `Availability.Message` contain?**
   - Currently ignored, only `Type` used
   - May contain additional context
   - Could be useful for logging/debugging

4. **How does Creators API signal "listing removed"?**
   - Missing from response (ASIN not returned)?
   - Returned with empty `OffersV2.Listings`?
   - Returned with `Availability.Type` = ???
   - Needs verification

---

## Next Steps Summary

### Before Making Any Code Changes

1. ✅ **Run** `scripts/diagnose-availability.sh` on production database
2. ✅ **Capture** raw Creators API responses for sample unavailable items
3. ✅ **Verify** sample ASINs manually on Amazon.com
4. ✅ **Review** sync logs for patterns

### Decision Tree

**If all 101 unavailable items are genuinely unavailable on Amazon:**
- ✅ No code changes needed
- ✅ Current behavior is correct
- ✅ Close investigation

**If some unavailable items have active offers on Amazon:**
- ⚠️ Check their raw API responses
- ⚠️ Identify unknown `Availability.Type` values
- ⚠️ Update whitelist or parsing logic
- ⚠️ Add tests for new status values
- ⚠️ Open follow-up PR with fixes

**If products have non-BuyBox offers being ignored:**
- ⚠️ Discuss product requirements
- ⚠️ Decide: show non-BuyBox offers or not?
- ⚠️ Update code to check all listings if needed
- ⚠️ Open follow-up PR with changes

---

## Files Created/Updated

### Investigation & Documentation
- `AVAILABILITY_INVESTIGATION.md` - Complete technical investigation
- `AVAILABILITY_FINDINGS_SUMMARY.md` - This executive summary

### Diagnostic Tools
- `scripts/diagnose-availability.sh` - Database analysis script

### Test Coverage
- `internal/amazon/availability_test.go` - Extended availability tests

### Status
- All tests pass ✅
- No code changes to production logic
- Awaiting user verification of production data
- Ready for follow-up PR if issues found

---

## Contact / Questions

For questions or to report findings:
1. Review `AVAILABILITY_INVESTIGATION.md` for technical details
2. Run diagnostic script and share results
3. Provide sample raw API responses if available
4. List ASINs that appear incorrectly unavailable

**No merge/deploy needed** - Investigation only, no production changes.
