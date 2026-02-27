package scoring

import (
	"database/sql"
	"encoding/json"
	"testing"
)

func TestNormalizeBounds(t *testing.T) {
	if got := normalizeHigherLinear(10, 20, 100); got != 0 {
		t.Fatalf("expected 0 below floor, got %v", got)
	}
	if got := normalizeHigherLinear(150, 20, 100); got != 100 {
		t.Fatalf("expected 100 above cap, got %v", got)
	}
	if got := normalizeLowerLinear(20, 20, 100); got != 100 {
		t.Fatalf("expected 100 at best, got %v", got)
	}
	if got := normalizeLowerLinear(100, 20, 100); got != 0 {
		t.Fatalf("expected 0 at worst, got %v", got)
	}
}

func TestComputeScores(t *testing.T) {
	row := SpecRow{
		FlashlightID:      1,
		MaxLumens:         sql.NullFloat64{Float64: 1800, Valid: true},
		MaxCandela:        sql.NullFloat64{Float64: 45000, Valid: true},
		BeamDistanceM:     sql.NullFloat64{Float64: 420, Valid: true},
		RuntimeMediumMin:  sql.NullFloat64{Float64: 240, Valid: true},
		RuntimeHighMin:    sql.NullFloat64{Float64: 95, Valid: true},
		WaterproofRating:  sql.NullString{String: "IP68", Valid: true},
		ImpactResistanceM: sql.NullFloat64{Float64: 1.5, Valid: true},
		PriceUSD:          sql.NullFloat64{Float64: 89.99, Valid: true},
	}

	scores, breakdown := computeScores(row, "v1")

	if scores.Tactical <= 0 || scores.EDC <= 0 || scores.Value <= 0 || scores.Throw <= 0 || scores.Flood <= 0 {
		t.Fatalf("expected positive scores, got %+v", scores)
	}
	if scores.Tactical > 100 || scores.EDC > 100 || scores.Value > 100 || scores.Throw > 100 || scores.Flood > 100 {
		t.Fatalf("expected scores <= 100, got %+v", scores)
	}

	var parsed map[string]any
	if err := json.Unmarshal(breakdown, &parsed); err != nil {
		t.Fatalf("invalid breakdown json: %v", err)
	}
	if _, ok := parsed["normalized"]; !ok {
		t.Fatalf("expected normalized in breakdown")
	}
}
