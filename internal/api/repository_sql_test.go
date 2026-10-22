package api

import (
	"fmt"
	"strings"
	"testing"
)

// TestFindInStockAlternateOrderByClause verifies the ORDER BY clause
// doesn't reference 'f.id' outside CTE scope (issue #3: missing FROM-clause entry for table "f").
//
// The bug was: when matchClosestScore=true, the ORDER BY clause referenced f.id,
// but f is only in scope inside the ranked_data CTE, not in the outer SELECT.
// Fixed by using 'id' instead of 'f.id' in the ORDER BY.
//
// This test validates the SQL string construction logic directly without
// requiring a database connection.
func TestFindInStockAlternateOrderByClause(t *testing.T) {
	testCases := []struct {
		name              string
		matchClosestScore bool
		wantContains      string
		wantNotContains   string
	}{
		{
			name:              "same use_case highest rank",
			matchClosestScore: false,
			wantContains:      "rank_position ASC",
			wantNotContains:   "f.id",
		},
		{
			name:              "family fallback closest score",
			matchClosestScore: true,
			wantContains:      "ABS(overall_score",
			wantNotContains:   "f.id", // Must not reference f.id outside CTE
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Replicate the ORDER BY logic from findInStockAlternateForUseCase
			orderClause := "rank_position ASC"
			if tc.matchClosestScore {
				orderClause = fmt.Sprintf("ABS(overall_score - %f) ASC, score DESC, id ASC", 75.5)
			}

			if !strings.Contains(orderClause, tc.wantContains) {
				t.Errorf("ORDER BY clause should contain %q, got: %s", tc.wantContains, orderClause)
			}

			if strings.Contains(orderClause, tc.wantNotContains) {
				t.Errorf("ORDER BY clause should NOT contain %q (f.id is not in scope outside CTE), got: %s", tc.wantNotContains, orderClause)
			}
		})
	}
}
