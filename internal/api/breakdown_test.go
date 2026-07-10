package api

import (
	"encoding/json"
	"testing"
)

func TestDecodeMetricBreakdown(t *testing.T) {
	t.Parallel()

	if got := decodeMetricBreakdown(nil); got != nil {
		t.Fatalf("nil input => nil, got %#v", got)
	}
	if got := decodeMetricBreakdown([]byte("{}")); got != nil {
		t.Fatalf("empty object => nil, got %#v", got)
	}
	if got := decodeMetricBreakdown([]byte("null")); got != nil {
		t.Fatalf("null => nil, got %#v", got)
	}
	if got := decodeMetricBreakdown([]byte("{not-json")); got != nil {
		t.Fatalf("invalid json => nil, got %#v", got)
	}

	raw := []byte(`{
		"raw": {"max_lumens": 1800, "amazon_avg_rating": 4.7},
		"normalized": {"max_lumens": 72.4},
		"weighted": {"overall": {"amazon_trust": 27.5, "value": 16.0}},
		"formula_version": "v2"
	}`)
	got := decodeMetricBreakdown(raw)
	if got == nil {
		t.Fatal("expected decoded breakdown")
	}
	if got.Formula != "v2" {
		t.Fatalf("formula_version: got %q", got.Formula)
	}
	if got.Raw["max_lumens"] != 1800 {
		t.Fatalf("raw.max_lumens: got %v", got.Raw["max_lumens"])
	}
	if got.Weighted["overall"]["amazon_trust"] != 27.5 {
		t.Fatalf("weighted.overall.amazon_trust: got %v", got.Weighted["overall"]["amazon_trust"])
	}

	// Round-trip through JSON to match API response shape
	out, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var again metricBreakdown
	if err := json.Unmarshal(out, &again); err != nil {
		t.Fatalf("unmarshal round-trip: %v", err)
	}
	if again.Formula != "v2" {
		t.Fatalf("round-trip formula: got %q", again.Formula)
	}
}
