package api

import (
	"database/sql"
	"testing"
)

func TestAvailabilityStatus(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   sql.NullBool
		want string
	}{
		{
			name: "in stock true",
			in:   sql.NullBool{Valid: true, Bool: true},
			want: "in_stock",
		},
		{
			name: "out of stock false",
			in:   sql.NullBool{Valid: true, Bool: false},
			want: "out_of_stock",
		},
		{
			name: "unknown null",
			in:   sql.NullBool{Valid: false},
			want: "unknown",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := availabilityStatus(tc.in)
			if got != tc.want {
				t.Fatalf("availabilityStatus(%v)=%q want %q", tc.in, got, tc.want)
			}
		})
	}
}
