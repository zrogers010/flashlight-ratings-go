package scoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"
)

type Engine struct {
	db *sql.DB
}

func NewEngine(db *sql.DB) *Engine {
	return &Engine{db: db}
}

type RunOptions struct {
	RunLabel       string
	FormulaVersion string
	InitiatedBy    string
}

type SpecRow struct {
	FlashlightID      int64
	MaxLumens         sql.NullFloat64
	MaxCandela        sql.NullFloat64
	BeamDistanceM     sql.NullFloat64
	RuntimeMediumMin  sql.NullFloat64
	RuntimeHighMin    sql.NullFloat64
	WaterproofRating  sql.NullString
	ImpactResistanceM sql.NullFloat64
	PriceUSD          sql.NullFloat64
	AmazonAvgRating   sql.NullFloat64
	AmazonRatingCount sql.NullFloat64
}

type ScoreOutput struct {
	Overall  float64
	Tactical float64
	EDC      float64
	Value    float64
	Throw    float64
	Flood    float64
}

type scoreBreakdown struct {
	Raw        map[string]float64            `json:"raw"`
	Normalized map[string]float64            `json:"normalized"`
	Weighted   map[string]map[string]float64 `json:"weighted"`
	Derived    map[string]bool               `json:"derived"` // Marks which raw values were derived via ANSI FL1
	Formula    string                        `json:"formula_version"`
}

type productScore struct {
	row        SpecRow
	scores     ScoreOutput
	breakdown  []byte
	isFullSpec bool
}

func (e *Engine) RunBatch(ctx context.Context, opts RunOptions) (int64, error) {
	if strings.TrimSpace(opts.RunLabel) == "" {
		opts.RunLabel = fmt.Sprintf("batch-%s", time.Now().UTC().Format("20060102-150405"))
	}
	if strings.TrimSpace(opts.FormulaVersion) == "" {
		opts.FormulaVersion = "v2"
	}
	if strings.TrimSpace(opts.InitiatedBy) == "" {
		opts.InitiatedBy = "scorejob"
	}

	runID, err := startRun(ctx, e.db, opts)
	if err != nil {
		return 0, err
	}

	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		_ = failRun(ctx, e.db, runID, err)
		return runID, err
	}
	defer tx.Rollback()

	profileIDs, err := ensureProfiles(ctx, tx, []string{"overall", "tactical", "edc", "value", "throw", "flood"})
	if err != nil {
		_ = failRun(ctx, e.db, runID, err)
		return runID, err
	}

	rows, err := loadSpecs(ctx, tx)
	if err != nil {
		_ = failRun(ctx, e.db, runID, err)
		return runID, err
	}

	profiles := []struct {
		key   string
		score func(ScoreOutput) float64
	}{
		{"overall", func(s ScoreOutput) float64 { return s.Overall }},
		{"tactical", func(s ScoreOutput) float64 { return s.Tactical }},
		{"edc", func(s ScoreOutput) float64 { return s.EDC }},
		{"value", func(s ScoreOutput) float64 { return s.Value }},
		{"throw", func(s ScoreOutput) float64 { return s.Throw }},
		{"flood", func(s ScoreOutput) float64 { return s.Flood }},
	}

	// Score all products and collect overall scores for cap calculation
	var productScores []productScore

	for _, row := range rows {
		scores, breakdown := computeScores(row, opts.FormulaVersion)
		
		// Determine if full-spec
		hasLumens := row.MaxLumens.Valid && row.MaxLumens.Float64 > 0
		hasCandela := row.MaxCandela.Valid && row.MaxCandela.Float64 > 0
		hasBeam := row.BeamDistanceM.Valid && row.BeamDistanceM.Float64 > 0
		hasRuntime := row.RuntimeHighMin.Valid && row.RuntimeHighMin.Float64 > 0
		isFullSpec := hasLumens && (hasCandela || hasBeam) && hasRuntime

		productScores = append(productScores, productScore{
			row:        row,
			scores:     scores,
			breakdown:  breakdown,
			isFullSpec: isFullSpec,
		})
	}

	// Apply partial-spec cap: find 10th-highest full-spec overall score
	capValue := applyPartialSpecCapInMemory(productScores)

	// Write scores to database
	for _, ps := range productScores {
		scores := ps.scores
		
		// Apply cap to partial-spec products' overall score only
		if !ps.isFullSpec && scores.Overall > capValue {
			scores.Overall = capValue
		}
		
		for _, p := range profiles {
			if err := upsertScore(ctx, tx, runID, ps.row.FlashlightID, profileIDs[p.key], p.score(scores), ps.breakdown); err != nil {
				_ = failRun(ctx, e.db, runID, err)
				return runID, err
			}
		}
	}

	if err := rankRun(ctx, tx, runID); err != nil {
		_ = failRun(ctx, e.db, runID, err)
		return runID, err
	}
	if err := tx.Commit(); err != nil {
		_ = failRun(ctx, e.db, runID, err)
		return runID, err
	}
	if err := completeRun(ctx, e.db, runID); err != nil {
		return runID, err
	}

	// Prune old runs so score history can't grow unbounded: the API only ever
	// reads the latest completed run, and the worker re-scores every cycle.
	// Without this the flashlight_scores table grows by a full catalog's worth
	// of rows per run (this once reached 14 GB and filled the disk).
	if err := pruneOldRuns(ctx, e.db, keepScoringRuns); err != nil {
		log.Printf("scoring: prune old runs: %v", err)
	}

	return runID, nil
}

func loadSpecs(ctx context.Context, tx *sql.Tx) ([]SpecRow, error) {
	const q = `
SELECT
	f.id,
	s.max_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_medium_min,
	s.runtime_high_min,
	s.waterproof_rating,
	s.impact_resistance_m,
	p.price,
	a.average_rating,
	a.rating_count
FROM flashlights f
JOIN flashlight_specs s ON s.flashlight_id = f.id
LEFT JOIN LATERAL (
	SELECT p1.price
	FROM flashlight_price_snapshots p1
	WHERE p1.flashlight_id = f.id
	  AND p1.currency_code = 'USD'
	ORDER BY p1.captured_at DESC
	LIMIT 1
) p ON TRUE
LEFT JOIN LATERAL (
	SELECT a1.average_rating, a1.rating_count
	FROM amazon_product_snapshots a1
	WHERE a1.flashlight_id = f.id
	ORDER BY a1.captured_at DESC
	LIMIT 1
) a ON TRUE
WHERE f.is_active = TRUE
`

	r, err := tx.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	out := make([]SpecRow, 0, 128)
	for r.Next() {
		var row SpecRow
		if err := r.Scan(
			&row.FlashlightID,
			&row.MaxLumens,
			&row.MaxCandela,
			&row.BeamDistanceM,
			&row.RuntimeMediumMin,
			&row.RuntimeHighMin,
			&row.WaterproofRating,
			&row.ImpactResistanceM,
			&row.PriceUSD,
			&row.AmazonAvgRating,
			&row.AmazonRatingCount,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := r.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// applyPartialSpecCapInMemory computes the partial-spec cap value.
// It finds the 10th-highest full-spec overall score and returns that minus 1.0.
// Partial-spec products' overall scores should be capped at this value.
// Returns a very high value (999.0) if fewer than 10 full-spec products exist.
func applyPartialSpecCapInMemory(productScores []productScore) float64 {
	// Collect full-spec overall scores
	var fullSpecScores []float64
	for _, ps := range productScores {
		if ps.isFullSpec {
			fullSpecScores = append(fullSpecScores, ps.scores.Overall)
		}
	}

	// Need at least 10 full-spec products to establish a meaningful cap
	if len(fullSpecScores) < 10 {
		return 999.0 // No cap
	}

	// Sort descending to find the 10th highest
	sort.Float64s(fullSpecScores)
	// Reverse to get descending order
	for i := 0; i < len(fullSpecScores)/2; i++ {
		j := len(fullSpecScores) - 1 - i
		fullSpecScores[i], fullSpecScores[j] = fullSpecScores[j], fullSpecScores[i]
	}

	tenthFullSpecScore := fullSpecScores[9] // 0-indexed
	return tenthFullSpecScore - 1.0
}

// ComputeScores computes all profile scores for a given product spec row.
// Exported for testing and analysis tools.
func ComputeScores(row SpecRow, formulaVersion string) (ScoreOutput, []byte) {
	return computeScores(row, formulaVersion)
}

func computeScores(row SpecRow, formulaVersion string) (ScoreOutput, []byte) {
	raw := map[string]float64{}
	norm := map[string]float64{}
	weighted := map[string]map[string]float64{}

	lumens := nullFloat(row.MaxLumens)
	candela := nullFloat(row.MaxCandela)
	beam := nullFloat(row.BeamDistanceM)
	runtimeHigh := nullFloat(row.RuntimeHighMin)
	runtimeMedium := nullFloat(row.RuntimeMediumMin)
	impact := nullFloat(row.ImpactResistanceM)
	price := nullFloat(row.PriceUSD)
	avgRating := nullFloat(row.AmazonAvgRating)
	ratingCount := nullFloat(row.AmazonRatingCount)
	durability := durabilityScore(row.WaterproofRating.String, impact)

	// Core specs: lumens, candela, beam (throw), runtime.
	// Derive candela from throw or vice versa using ANSI FL1: throw_m = 2 × √candela
	hasLumens := lumens > 0
	hasCandela := candela > 0
	hasBeam := beam > 0
	hasRuntime := runtimeHigh > 0
	
	// Track which values were derived (not from manufacturer specs)
	derived := map[string]bool{}
	
	if !hasCandela && hasBeam {
		candela = (beam * beam) / 4.0
		hasCandela = true
		derived["max_candela"] = true
	} else if !hasBeam && hasCandela {
		beam = 2.0 * math.Sqrt(candela)
		hasBeam = true
		derived["beam_distance_m"] = true
	}
	
	// Insufficient data check: we can score from any brightness metric (lumens, candela, or throw).
	// Return 0 only when we have no brightness specs at all - lumens is the most fundamental
	// flashlight metric and alone can produce a meaningful ranking.
	if !hasLumens && !hasCandela && !hasBeam {
		return ScoreOutput{}, []byte("{}")
	}
	
	// Partial-spec confidence penalty: products missing any core metric (lumens, candela/throw, or runtime)
	// receive a 12% penalty to gently discourage incomplete specs.
	// A separate cap (applied during batch scoring) ensures no partial-spec product ranks in the top 10.
	hasAllCoreMetrics := hasLumens && (hasCandela || hasBeam) && hasRuntime
	confidenceFactor := 1.0
	if !hasAllCoreMetrics {
		confidenceFactor = 0.88 // 12% penalty for missing any core metric
	}
	
	// Low-output cap: Flashlights under 200 lumens have their scores capped to prevent
	// low-output specialty lights (medical penlights, keychain lights) from outranking
	// high-performance tactical/EDC lights due to runtime or ratings alone.
	// Output is the primary flashlight metric; runtime and ratings are secondary.
	lowOutputCap := 1.0
	if hasLumens && lumens < 200 {
		// Progressive cap: 100+ lm = 90% max, 50+ lm = 80% max, <50 lm = 70% max
		if lumens >= 100 {
			lowOutputCap = 0.90
		} else if lumens >= 50 {
			lowOutputCap = 0.80
		} else {
			lowOutputCap = 0.70
		}
	}
	
	confidenceFactor *= lowOutputCap
	
	// Normalize core specs
	raw["max_lumens"] = lumens
	norm["max_lumens"] = normalizeHigherLog(lumens, 100, 5000)
	
	raw["max_candela"] = candela
	norm["max_candela"] = normalizeHigherLog(candela, 1000, 100000)
	
	raw["beam_distance_m"] = beam
	norm["beam_distance_m"] = normalizeHigherLog(beam, 50, 700)
	
	// Runtime: don't penalize if missing, just skip it
	if runtimeHigh > 0 {
		raw["runtime_high_min"] = runtimeHigh
		norm["runtime_high_min"] = normalizeHigherLog(runtimeHigh, 20, 300)
	}
	
	// Medium runtime: skip entirely (CSV import doesn't populate it)
	if runtimeMedium > 0 {
		raw["runtime_medium_min"] = runtimeMedium
		norm["runtime_medium_min"] = normalizeHigherLog(runtimeMedium, 60, 900)
	}
	
	raw["durability"] = durability
	norm["durability"] = durability

	// Price, Amazon ratings: skip if missing (no penalty)
	if price > 0 {
		raw["price_usd"] = price
		norm["price"] = normalizeLowerLinear(price, 15, 250)
	}

	// Amazon Trust: 60% rating quality + 40% rating confidence
	if avgRating > 0 {
		raw["amazon_avg_rating"] = avgRating
		norm["amazon_avg_rating"] = normalizeHigherLinear(avgRating, 3.5, 5.0)
	}
	if ratingCount > 0 {
		raw["amazon_rating_count"] = ratingCount
		norm["amazon_rating_count"] = normalizeHigherLog(ratingCount, 20, 5000)
	}

	amazonTrust := weightedMean("amazon_trust", []namedPair{
		{name: "amazon_avg_rating", value: norm["amazon_avg_rating"], weight: 0.60},
		{name: "amazon_rating_count", value: norm["amazon_rating_count"], weight: 0.40},
	}, weighted)

	// Performance: raw capability blend
	performanceScore := weightedMean("performance", []namedPair{
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.35},
		{name: "max_candela", value: norm["max_candela"], weight: 0.25},
		{name: "beam_distance_m", value: norm["beam_distance_m"], weight: 0.20},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.20},
	}, weighted)

	// Value: performance relative to price
	perfBlend := weightedMean("perf_blend", []namedPair{
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.40},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.30},
		{name: "max_candela", value: norm["max_candela"], weight: 0.30},
	}, weighted)

	valueScore := weightedMean("value", []namedPair{
		{name: "perf_blend", value: perfBlend, weight: 0.55},
		{name: "price", value: norm["price"], weight: 0.45},
	}, weighted)

	// Overall: Amazon-anchored composite
	overallScore := weightedMean("overall", []namedPair{
		{name: "amazon_trust", value: amazonTrust, weight: 0.35},
		{name: "value", value: valueScore, weight: 0.25},
		{name: "performance", value: performanceScore, weight: 0.25},
		{name: "durability", value: norm["durability"], weight: 0.15},
	}, weighted)

	// Category scores — each includes Amazon Trust at 15%
	throwScore := weightedMean("throw", []namedPair{
		{name: "max_candela", value: norm["max_candela"], weight: 0.35},
		{name: "beam_distance_m", value: norm["beam_distance_m"], weight: 0.25},
		{name: "amazon_trust", value: amazonTrust, weight: 0.15},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.15},
		{name: "durability", value: norm["durability"], weight: 0.10},
	}, weighted)

	floodScore := weightedMean("flood", []namedPair{
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.35},
		{name: "runtime_medium_min", value: norm["runtime_medium_min"], weight: 0.20},
		{name: "amazon_trust", value: amazonTrust, weight: 0.15},
		{name: "price", value: norm["price"], weight: 0.15},
		{name: "durability", value: norm["durability"], weight: 0.15},
	}, weighted)

	tacticalScore := weightedMean("tactical", []namedPair{
		{name: "max_candela", value: norm["max_candela"], weight: 0.25},
		{name: "durability", value: norm["durability"], weight: 0.20},
		{name: "amazon_trust", value: amazonTrust, weight: 0.15},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.15},
		{name: "throw", value: throwScore, weight: 0.15},
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.10},
	}, weighted)

	edcScore := weightedMean("edc", []namedPair{
		{name: "runtime_medium_min", value: norm["runtime_medium_min"], weight: 0.25},
		{name: "price", value: norm["price"], weight: 0.20},
		{name: "amazon_trust", value: amazonTrust, weight: 0.15},
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.15},
		{name: "flood", value: floodScore, weight: 0.15},
		{name: "durability", value: norm["durability"], weight: 0.10},
	}, weighted)

	breakdown, _ := json.Marshal(scoreBreakdown{
		Raw:        raw,
		Normalized: norm,
		Weighted:   weighted,
		Derived:    derived,
		Formula:    formulaVersion,
	})

	return ScoreOutput{
		Overall:  round3(boostScore(overallScore) * confidenceFactor),
		Tactical: round3(boostScore(tacticalScore) * confidenceFactor),
		EDC:      round3(boostScore(edcScore) * confidenceFactor),
		Value:    round3(boostScore(valueScore) * confidenceFactor),
		Throw:    round3(boostScore(throwScore) * confidenceFactor),
		Flood:    round3(boostScore(floodScore) * confidenceFactor),
	}, breakdown
}

// boostScore rescales a raw 0-100 weighted mean into a more intuitive range.
// Targets: mid-range products 65-75, high-end 80-85.
func boostScore(raw float64) float64 {
	if raw <= 0 {
		return 0
	}
	// Formula: 35 + (raw * 0.60)
	// - Raw 45 → 62 (budget)
	// - Raw 60 → 71 (mid-range)
	// - Raw 75 → 80 (good)
	// - Raw 85 → 86 (excellent)
	// - Raw 92 → 90.2 (top-tier)
	boosted := 35 + (raw * 0.60)
	if boosted > 100 {
		return 100
	}
	return boosted
}

type namedPair struct {
	name   string
	value  float64
	weight float64
}

func weightedMean(group string, items []namedPair, weighted map[string]map[string]float64) float64 {
	var (
		totalWeight float64
		total       float64
	)
	groupMap := map[string]float64{}
	for _, it := range items {
		// Skip items with value <= 0 or weight <= 0
		// This lets non-core metrics (price, Amazon, etc.) be omitted without penalty
		if it.value <= 0 || it.weight <= 0 {
			continue
		}
		totalWeight += it.weight
		total += it.value * it.weight
		groupMap[it.name] = round3(it.value * it.weight)
	}
	if len(groupMap) > 0 {
		weighted[group] = groupMap
	}
	if totalWeight == 0 {
		return 0
	}
	return total / totalWeight
}

func durabilityScore(waterproof string, impact float64) float64 {
	ipComponent := 30.0
	switch strings.ToUpper(strings.TrimSpace(waterproof)) {
	case "IPX4", "IP54", "IP64":
		ipComponent = 55
	case "IPX6", "IP66":
		ipComponent = 70
	case "IPX7", "IP67":
		ipComponent = 85
	case "IPX8", "IP68":
		ipComponent = 95
	}

	impactNorm := 0.0
	if impact > 0 {
		impactNorm = normalizeHigherLinear(impact, 1, 3)
	}
	return (ipComponent * 0.65) + (impactNorm * 0.35)
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func nullFloat(v sql.NullFloat64) float64 {
	if !v.Valid {
		return 0
	}
	return v.Float64
}
