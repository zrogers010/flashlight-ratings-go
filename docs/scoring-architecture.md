# Scoring Formula Architecture (v1)

## 1) Design goals
- Keep formulas explainable and auditable.
- Keep profile weights/config in Postgres, not hardcoded in Go.
- Support versioned recalculation jobs and score history.

## 2) Data model linkage
- Raw specs live in `flashlight_specs` and `flashlight_modes`.
- Price input for value scoring comes from latest `flashlight_price_snapshots` (source `amazon`, region `US`).
- Formula metadata lives in:
  - `scoring_profiles`
  - `scoring_metrics`
  - `scoring_profile_metrics`
- Execution snapshots live in:
  - `scoring_runs`
  - `flashlight_scores`

## 3) Normalization rules
All metric contributions are normalized to `0..100`.

### 3.1 Higher is better
For metric `x` with floor `f` and cap `c`:

```text
n_linear = clamp((x - f) / (c - f), 0, 1) * 100
```

For log-scaled metrics:

```text
n_log = clamp((ln(x) - ln(f)) / (ln(c) - ln(f)), 0, 1) * 100
```

### 3.2 Lower is better

```text
n_lower = 100 - clamp((x - c) / (f - c), 0, 1) * 100
```

Use `f` as worst acceptable and `c` as best target.

### 3.3 Boolean
- `true -> 100`
- `false -> 0`

### 3.4 Piecewise (example: IP rating)
Use `config.ip_map` from `scoring_profile_metrics` and map strings (for example `IPX4`, `IPX6`, `IPX7`, `IPX8`) to points.

## 4) Derived metrics
These are computed in Go before profile scoring.

### 4.1 `performance_core`

```text
performance_core = 0.50 * norm(max_candela)
                 + 0.25 * norm(max_lumens)
                 + 0.15 * norm(runtime_high_min)
                 + 0.10 * norm(runtime_medium_min)
```

### 4.2 `performance_per_dollar`

```text
performance_per_dollar = performance_core / latest_price_usd
```

If no recent price exists, set derived metric to `NULL` and mark in `metric_breakdown.missing`.

## 5) Profile formulas (v1)
Weights are persisted in `scoring_profile_metrics`. Defaults:

- Tactical:
  - Candela, throw, high runtime, waterproofing, impact resistance, strobe, lockout, lumens.
- EDC:
  - Weight, length, medium runtime, USB-C charging, pocket clip, lockout, lumens, waterproofing.
- Value:
  - Performance per dollar, medium runtime, waterproofing, USB-C.
- Overall:
  - Weighted blend of Tactical, EDC, Value subscores.

Computation:

```text
profile_score = sum(metric_weight_i * normalized_metric_i) / sum(metric_weight_i_present)
```

`metric_weight_i_present` excludes missing metrics to avoid hard penalizing incomplete records.

## 6) Ranking flow
1. Create a row in `scoring_runs` with `status='running'` and `formula_version='v1'`.
2. Load active profiles and metric configs.
3. For each flashlight:
   - Load raw specs and latest price.
   - Compute derived metrics.
   - Normalize each metric.
   - Compute profile scores.
4. Upsert rows into `flashlight_scores` with `metric_breakdown` JSON.
5. Assign rank per profile (`DENSE_RANK` on score descending).
6. Mark run `completed_at` and `status='completed'`.

## 7) Explainability contract
`flashlight_scores.metric_breakdown` should include:
- `raw`: raw input values by metric slug
- `normalized`: normalized `0..100` values
- `weighted`: weighted contribution
- `missing`: array of missing metric slugs
- `formula_version`

This powers UI score tooltips and debugging.

## 8) Versioning strategy
- Any weight or normalization change increments `scoring_profiles.version`.
- New formula code path increments `scoring_runs.formula_version` (for example `v2`).
- Keep old runs for historical comparison and SEO stability checks.

## 9) Smart Finder compatibility
Smart Finder can reuse profile formulas by dynamically overriding weights at query time:
- Start from profile defaults.
- Apply user preference multipliers (for example, favor low weight).
- Recompute scores in-memory and return ranked IDs.

Persist only canonical profile runs in `flashlight_scores`; Finder results are ephemeral.
