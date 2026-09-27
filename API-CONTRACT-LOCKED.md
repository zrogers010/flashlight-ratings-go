# 🔒 LOCKED API CONTRACT - W1-01

**Status**: LOCKED - Frontend has bound to these exact field names.  
**Do not change**: Any modifications will break Frontend badges (W1-02).

## Field Names (JSON)

### All Flashlight Responses

Every flashlight object in any endpoint includes:

```json
{
  "in_stock": true,                           // boolean | null (NOT amazon_in_stock)
  "availability_status": "in_stock"           // "in_stock" | "out_of_stock" | "unknown"
}
```

### Ranking Response (`/rankings`)

```json
{
  "rank_position": 1,                         // number (NOT rank)
  "rank_position_raw": 1,                     // number (score-only rank)
  "score": 92.5,                              // number
  "profile": "tactical",                      // string
  "flashlight": {
    "id": 123,
    "brand": "Olight",
    "name": "Warrior X Pro",
    "slug": "olight-warrior-x-pro",
    "in_stock": false,                        // boolean | null
    "availability_status": "out_of_stock",    // enum string
    "image_url": "...",
    "amazon_url": "...",
    "price_usd": 89.95,
    // ... other specs
  },
  "in_stock_alternate": {                     // null | object (NOT alternate_in_stock)
    "id": 456,                                // number
    "slug": "streamlight-protac-hl-x",        // string
    "name": "ProTac HL-X",                    // string
    "brand_name": "Streamlight",              // string (NOT brand)
    "score": 89.2,                            // number | null
    "rank_position": 2,                       // number | null (NOT rank)
    "affiliate_url": "...",                   // string | null (NOT amazon_url)
    "image_url": "..."                        // string | null
  }
}
```

## Field Mapping (Old → New)

| Old Name | New Name | Notes |
|----------|----------|-------|
| `amazon_in_stock` | `in_stock` | Raw boolean from DB |
| N/A | `availability_status` | NEW: Derived enum |
| `rank` | `rank_position` | Availability-aware |
| N/A | `rank_position_raw` | NEW: Score-only rank |
| `alternate_in_stock` | `in_stock_alternate` | Renamed |
| `brand` (in alternate) | `brand_name` | In alternate only |
| `amazon_url` (in alternate) | `affiliate_url` | In alternate only |
| `rank` (in alternate) | `rank_position` | In alternate only |

## Availability Status Derivation

```typescript
function deriveAvailabilityStatus(in_stock: boolean | null): string {
  if (in_stock === true) return "in_stock";
  if (in_stock === false) return "out_of_stock";
  return "unknown";  // in_stock === null
}
```

## Ranking Sort Order

**Stable Partition**: `(in_stock + unknown)` before `out_of_stock`, then score DESC

SQL Implementation:
```sql
ORDER BY
  CASE WHEN lp.in_stock = FALSE THEN 1 ELSE 0 END ASC,  -- OOS last
  COALESCE(fs.score, 0) DESC,                           -- Score descending
  f.id ASC                                               -- Tie-breaker
```

**Critical**: `unknown` (NULL stock) is NOT demoted. It ranks with `in_stock`.

## In-Stock Alternate Rules

- **When**: Set when `availability_status === "out_of_stock"`
- **What**: Highest-ranked in-stock product from same use case
- **Fields**: ALL optional except id, slug, name, brand_name
- **Scope**: Same use case only (tactical alternate for tactical ranking)

## TypeScript Types (Reference)

```typescript
type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'unknown';

interface Flashlight {
  id: number;
  brand: string;
  name: string;
  slug: string;
  in_stock: boolean | null;
  availability_status: AvailabilityStatus;
  image_url?: string;
  amazon_url?: string;
  price_usd?: number;
  // ... other fields
}

interface InStockAlternate {
  id: number;
  slug: string;
  name: string;
  brand_name: string;          // NOT brand
  score?: number;
  rank_position?: number;      // NOT rank
  affiliate_url?: string;      // NOT amazon_url
  image_url?: string;
}

interface RankedProduct {
  rank_position: number;       // NOT rank
  rank_position_raw: number;
  score: number;
  profile: string;
  flashlight: Flashlight;
  in_stock_alternate: InStockAlternate | null;  // NOT alternate_in_stock
}

interface FlashlightListResponse {
  page: number;
  page_size: number;
  total: number;              // Real DB count (≥178)
  total_pages: number;
  items: Flashlight[];
}

interface RankingsResponse {
  use_case: string;
  page: number;
  page_size: number;
  total: number;              // Real DB count
  total_pages: number;
  items: RankedProduct[];
}
```

## Verification Commands

### Check Field Names
```bash
# Verify in_stock and availability_status
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=5' | \
  jq '.items[0].flashlight | {in_stock, availability_status}'

# Verify in_stock_alternate structure
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=10' | \
  jq '.items[] | select(.flashlight.availability_status == "out_of_stock") | .in_stock_alternate | keys'

# Should output: ["affiliate_url", "brand_name", "id", "image_url", "name", "rank_position", "score", "slug"]
```

### Check Demotion Logic
```bash
# Verify unknown NOT demoted
curl 'http://localhost:8080/rankings?use_case=tactical&page=1&page_size=20' | \
  jq '.items | map({rank_position, availability_status, score}) | 
      group_by(.availability_status) | 
      map({status: .[0].availability_status, count: length, avg_rank: (map(.rank_position) | add / length)})'

# Expected: in_stock and unknown have low avg_rank, out_of_stock has high avg_rank
```

## Breaking Change Checklist

If you need to modify this contract (DO NOT without approval):

- [ ] Update Go struct field names AND JSON tags
- [ ] Update all SQL queries using the fields
- [ ] Update ranking_test.go documentation
- [ ] Update W1-01-VERIFICATION.md
- [ ] Update PR #54 description
- [ ] Notify Frontend team BEFORE merging
- [ ] Coordinate deployment with Frontend

## Contract Version

**Version**: 1.0  
**Locked**: 2026-09-27  
**PR**: #54  
**Frontend Dependencies**: W1-02 (hero badges)
