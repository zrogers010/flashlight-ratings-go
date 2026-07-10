package api

import (
	"strings"
	"testing"
)

func TestNormalizeSearchQuery(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"   ", ""},
		{"  fenix  pd36  ", "fenix pd36"},
		{"wurkkos", "wurkkos"},
	}
	for _, tc := range cases {
		if got := normalizeSearchQuery(tc.in); got != tc.want {
			t.Fatalf("normalizeSearchQuery(%q)=%q want %q", tc.in, got, tc.want)
		}
	}

	long := strings.Repeat("a", 100)
	got := normalizeSearchQuery(long)
	if len(got) != 80 {
		t.Fatalf("expected capped length 80, got %d", len(got))
	}
}

func TestBuildFlashlightWhereIncludesQuery(t *testing.T) {
	t.Parallel()

	where, args := buildFlashlightWhere(flashlightFilters{Query: "fenix"})
	if len(args) != 1 {
		t.Fatalf("expected 1 arg, got %d (%v)", len(args), args)
	}
	if args[0] != "%fenix%" {
		t.Fatalf("expected %%fenix%% pattern, got %v", args[0])
	}
	for _, needle := range []string{"f.name ILIKE", "b.name ILIKE", "f.slug ILIKE", "model_code"} {
		if !strings.Contains(where, needle) {
			t.Fatalf("WHERE missing %q:\n%s", needle, where)
		}
	}
}
