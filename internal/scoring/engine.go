package scoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
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
}

type ScoreOutput struct {
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
	Formula    string                        `json:"formula_version"`
}

func (e *Engine) RunBatch(ctx context.Context, opts RunOptions) (int64, error) {
	if strings.TrimSpace(opts.RunLabel) == "" {
		opts.RunLabel = fmt.Sprintf("batch-%s", time.Now().UTC().Format("20060102-150405"))
	}
	if strings.TrimSpace(opts.FormulaVersion) == "" {
		opts.FormulaVersion = "v1"
	}
	if strings.TrimSpace(opts.InitiatedBy) == "" {
		opts.InitiatedBy = "scorejob"
	}

	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	runID, err := startRun(ctx, tx, opts)
	if err != nil {
		return 0, err
	}

	profileIDs, err := ensureProfiles(ctx, tx, []string{"tactical", "edc", "value", "throw", "flood"})
	if err != nil {
		return runID, failRun(ctx, tx, runID, err)
	}

	rows, err := loadSpecs(ctx, tx)
	if err != nil {
		return runID, failRun(ctx, tx, runID, err)
	}

	for _, row := range rows {
		scores, breakdown := computeScores(row, opts.FormulaVersion)
		if err := upsertScore(ctx, tx, runID, row.FlashlightID, profileIDs["tactical"], scores.Tactical, breakdown); err != nil {
			return runID, failRun(ctx, tx, runID, err)
		}
		if err := upsertScore(ctx, tx, runID, row.FlashlightID, profileIDs["edc"], scores.EDC, breakdown); err != nil {
			return runID, failRun(ctx, tx, runID, err)
		}
		if err := upsertScore(ctx, tx, runID, row.FlashlightID, profileIDs["value"], scores.Value, breakdown); err != nil {
			return runID, failRun(ctx, tx, runID, err)
		}
		if err := upsertScore(ctx, tx, runID, row.FlashlightID, profileIDs["throw"], scores.Throw, breakdown); err != nil {
			return runID, failRun(ctx, tx, runID, err)
		}
		if err := upsertScore(ctx, tx, runID, row.FlashlightID, profileIDs["flood"], scores.Flood, breakdown); err != nil {
			return runID, failRun(ctx, tx, runID, err)
		}
	}

	if err := rankRun(ctx, tx, runID); err != nil {
		return runID, failRun(ctx, tx, runID, err)
	}
	if err := completeRun(ctx, tx, runID); err != nil {
		return runID, err
	}
	if err := tx.Commit(); err != nil {
		return runID, err
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
	p.price
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
	durability := durabilityScore(row.WaterproofRating.String, impact)

	if lumens > 0 {
		raw["max_lumens"] = lumens
		norm["max_lumens"] = normalizeHigherLog(lumens, 100, 5000)
	}
	if candela > 0 {
		raw["max_candela"] = candela
		norm["max_candela"] = normalizeHigherLog(candela, 1000, 120000)
	}
	if beam > 0 {
		raw["beam_distance_m"] = beam
		norm["beam_distance_m"] = normalizeHigherLog(beam, 60, 700)
	}
	if runtimeHigh > 0 {
		raw["runtime_high_min"] = runtimeHigh
		norm["runtime_high_min"] = normalizeHigherLog(runtimeHigh, 20, 300)
	}
	if runtimeMedium > 0 {
		raw["runtime_medium_min"] = runtimeMedium
		norm["runtime_medium_min"] = normalizeHigherLog(runtimeMedium, 60, 900)
	}
	raw["durability"] = durability
	norm["durability"] = durability

	if price > 0 {
		raw["price_usd"] = price
		norm["price"] = normalizeLowerLinear(price, 20, 300)
	}

	throwScore := weightedMean("throw", []namedPair{
		{name: "max_candela", value: norm["max_candela"], weight: 0.45},
		{name: "beam_distance_m", value: norm["beam_distance_m"], weight: 0.30},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.15},
		{name: "durability", value: norm["durability"], weight: 0.10},
	}, weighted)

	floodScore := weightedMean("flood", []namedPair{
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.50},
		{name: "runtime_medium_min", value: norm["runtime_medium_min"], weight: 0.25},
		{name: "price", value: norm["price"], weight: 0.15},
		{name: "durability", value: norm["durability"], weight: 0.10},
	}, weighted)

	tacticalScore := weightedMean("tactical", []namedPair{
		{name: "max_candela", value: norm["max_candela"], weight: 0.30},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.20},
		{name: "durability", value: norm["durability"], weight: 0.20},
		{name: "throw", value: throwScore, weight: 0.20},
		{name: "price", value: norm["price"], weight: 0.10},
	}, weighted)

	edcScore := weightedMean("edc", []namedPair{
		{name: "runtime_medium_min", value: norm["runtime_medium_min"], weight: 0.30},
		{name: "flood", value: floodScore, weight: 0.20},
		{name: "durability", value: norm["durability"], weight: 0.15},
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.15},
		{name: "price", value: norm["price"], weight: 0.20},
	}, weighted)

	performanceMean := weightedMean("performance", []namedPair{
		{name: "max_lumens", value: norm["max_lumens"], weight: 0.35},
		{name: "max_candela", value: norm["max_candela"], weight: 0.25},
		{name: "runtime_high_min", value: norm["runtime_high_min"], weight: 0.20},
		{name: "durability", value: norm["durability"], weight: 0.20},
	}, weighted)

	valueScore := weightedMean("value", []namedPair{
		{name: "performance", value: performanceMean, weight: 0.60},
		{name: "price", value: norm["price"], weight: 0.40},
	}, weighted)

	breakdown, _ := json.Marshal(scoreBreakdown{
		Raw:        raw,
		Normalized: norm,
		Weighted:   weighted,
		Formula:    formulaVersion,
	})

	return ScoreOutput{
		Tactical: round3(tacticalScore),
		EDC:      round3(edcScore),
		Value:    round3(valueScore),
		Throw:    round3(throwScore),
		Flood:    round3(floodScore),
	}, breakdown
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
