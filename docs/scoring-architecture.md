# Scoring Formula Architecture (v2)

**Source of truth:** `internal/scoring/engine.go` (`formula_version = "v2"`).

The public explanation lives at `/guides/how-we-score`. The on-page UI
(`ScoreBreakdown`) uses the same weights as this document.

> Historical note: an earlier v1 design stored weights primarily in Postgres
> (`scoring_profile_metrics`). The live batch scorer uses **hardcoded v2**
> formulas in Go. Seed rows in `db/seeds/0001_scoring_profiles.sql` are kept
> aligned with v2 for documentation / tooling, but runtime scoring does not
> read those weights dynamically.

## 1) Design goals

- Explainable, auditable scores (raw → normalized → weighted breakdown).
- Versioned scoring runs (`scoring_runs.formula_version`).
- Amazon-anchored Overall score plus use-case profiles.
- Missing inputs are skipped in weighted means (no hard zero for absent metrics).

## 2) Data inputs

| Input | Source |
|-------|--------|
| Specs | `flashlight_specs` |
| Price (USD) | Latest `flashlight_price_snapshots` |
| Amazon rating / count | Latest `amazon_product_snapshots` |
| Profiles | `scoring_profiles` (slugs: overall, tactical, edc, value, throw, flood) |
| Outputs | `flashlight_scores` (+ `metric_breakdown` JSON) |

## 3) Normalization (0–100)

### Higher-is-better (log)

Used for lumens, candela, beam distance, runtimes, Amazon review count:

```text
n_log = clamp((ln(x) - ln(floor)) / (ln(cap) - ln(floor)), 0, 1) * 100
```

Approximate floors/caps in v2:

| Metric | Floor | Cap |
|--------|-------|-----|
| max_lumens | 100 | 5000 |
| max_candela | 1000 | 100000 |
| beam_distance_m | 50 | 700 |
| runtime_high_min | 20 | 300 |
| runtime_medium_min | 60 | 900 |
| amazon_rating_count | 20 | 5000 |

### Higher-is-better (linear)

| Metric | Floor | Cap |
|--------|-------|-----|
| amazon_avg_rating | 3.5 | 5.0 |
| impact (within durability) | 1 m | 3 m |

### Lower-is-better (linear)

| Metric | Best | Worst |
|--------|------|-------|
| price_usd | 15 | 250 |

### Durability composite

```text
durability = 0.65 * ip_component + 0.35 * norm(impact_m)

ip_component examples:
  IPX4/IP54/IP64 → 55
  IPX6/IP66      → 70
  IPX7/IP67      → 85
  IPX8/IP68      → 95
  (default)      → 30
```

## 4) Composites

### Amazon Trust

```text
amazon_trust = 0.60 * norm(amazon_avg_rating)
             + 0.40 * norm(amazon_rating_count)
```

### Performance (Overall)

```text
performance = 0.35 * lumens
            + 0.25 * candela
            + 0.20 * beam_distance
            + 0.20 * runtime_high
```

### Performance blend (Value)

```text
perf_blend = 0.40 * lumens
           + 0.30 * runtime_high
           + 0.30 * candela
```

## 5) Profile formulas (v2)

### Overall

```text
overall = 0.35 * amazon_trust
        + 0.25 * value
        + 0.25 * performance
        + 0.15 * durability
```

### Value

```text
value = 0.55 * perf_blend + 0.45 * price
```

### Throw

```text
throw = 0.35 * candela
      + 0.25 * beam_distance
      + 0.15 * amazon_trust
      + 0.15 * runtime_high
      + 0.10 * durability
```

### Flood

```text
flood = 0.35 * lumens
      + 0.20 * runtime_medium
      + 0.15 * amazon_trust
      + 0.15 * price
      + 0.15 * durability
```

### Tactical

```text
tactical = 0.25 * candela
         + 0.20 * durability
         + 0.15 * amazon_trust
         + 0.15 * runtime_high
         + 0.15 * throw
         + 0.10 * lumens
```

### EDC

```text
edc = 0.25 * runtime_medium
    + 0.20 * price
    + 0.15 * amazon_trust
    + 0.15 * lumens
    + 0.15 * flood
    + 0.10 * durability
```

Weighted means only include metrics with positive normalized values; weights of
present metrics are renormalized implicitly by dividing by their sum.

## 6) Score boost

After the weighted mean:

```text
displayed = min(100, 35 + raw * 0.65)
```

This lifts typical curated products into a more intuitive ~70–90 band.
`metric_breakdown` stores **pre-boost** weighted contributions.

## 7) Ranking flow

1. Create `scoring_runs` with `status='running'`, `formula_version='v2'`.
2. Load active flashlights + latest price + Amazon snapshots.
3. For each flashlight, `computeScores` → upsert one `flashlight_scores` row
   per profile (same `metric_breakdown` JSON on each profile row).
4. Assign `DENSE_RANK` per profile.
5. Mark run `completed`.

## 8) Explainability contract (`metric_breakdown`)

```json
{
  "raw": { "max_lumens": 1800, "price_usd": 89.99, "amazon_avg_rating": 4.7, "...": "..." },
  "normalized": { "max_lumens": 72.4, "price": 62.0, "...": "..." },
  "weighted": {
    "amazon_trust": { "amazon_avg_rating": 48.0, "amazon_rating_count": 31.4 },
    "overall": { "amazon_trust": 27.8, "value": 16.0, "performance": 17.9, "durability": 13.1 },
    "tactical": { "...": "..." }
  },
  "formula_version": "v2"
}
```

Exposed on `GET /flashlights/:id` as `metric_breakdown` for the review UI.

## 9) Versioning

- Change formulas in `engine.go` and bump `formula_version` (e.g. `v3`).
- Keep old `scoring_runs` for history.
- Update `/guides/how-we-score`, this doc, and `ScoreBreakdown` weights together.
