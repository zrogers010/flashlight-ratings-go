package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

type queryExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func startRun(ctx context.Context, db queryExecer, opts RunOptions) (int64, error) {
	const q = `
INSERT INTO scoring_runs (run_label, formula_version, status, initiated_by, started_at)
VALUES ($1, $2, 'running', $3, NOW())
RETURNING id
`
	var runID int64
	if err := db.QueryRowContext(ctx, q, opts.RunLabel, opts.FormulaVersion, opts.InitiatedBy).Scan(&runID); err != nil {
		return 0, err
	}
	return runID, nil
}

func completeRun(ctx context.Context, db queryExecer, runID int64) error {
	const q = `
UPDATE scoring_runs
SET status = 'completed', completed_at = NOW()
WHERE id = $1
`
	_, err := db.ExecContext(ctx, q, runID)
	return err
}

func failRun(ctx context.Context, db queryExecer, runID int64, runErr error) error {
	const q = `
UPDATE scoring_runs
SET status = 'failed', completed_at = NOW(), notes = $2
WHERE id = $1
`
	_, _ = db.ExecContext(ctx, q, runID, truncate(fmt.Sprintf("error: %v", runErr), 2000))
	return runErr
}

func ensureProfiles(ctx context.Context, tx *sql.Tx, slugs []string) (map[string]int64, error) {
	const upsert = `
INSERT INTO scoring_profiles (slug, display_name, description, version, is_active)
VALUES ($1, $2, $3, 1, TRUE)
ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
RETURNING id
`

	out := make(map[string]int64, len(slugs))
	for _, slug := range slugs {
		var id int64
		display := titleSlug(slug) + " Score"
		desc := "Auto-managed by scoring engine batch job."
		if err := tx.QueryRowContext(ctx, upsert, slug, display, desc).Scan(&id); err != nil {
			return nil, err
		}
		out[slug] = id
	}
	return out, nil
}

func upsertScore(ctx context.Context, tx *sql.Tx, runID, flashlightID, profileID int64, score float64, breakdown []byte) error {
	const q = `
INSERT INTO flashlight_scores (run_id, flashlight_id, profile_id, score, metric_breakdown, generated_at)
VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
ON CONFLICT (run_id, flashlight_id, profile_id)
DO UPDATE SET
	score = EXCLUDED.score,
	metric_breakdown = EXCLUDED.metric_breakdown,
	generated_at = NOW()
`
	_, err := tx.ExecContext(ctx, q, runID, flashlightID, profileID, score, string(breakdown))
	return err
}

func rankRun(ctx context.Context, tx *sql.Tx, runID int64) error {
	const q = `
WITH ranked AS (
	SELECT
		run_id,
		flashlight_id,
		profile_id,
		DENSE_RANK() OVER (
			PARTITION BY run_id, profile_id
			ORDER BY score DESC
		) AS rnk
	FROM flashlight_scores
	WHERE run_id = $1
)
UPDATE flashlight_scores fs
SET rank_position = ranked.rnk
FROM ranked
WHERE fs.run_id = ranked.run_id
  AND fs.flashlight_id = ranked.flashlight_id
  AND fs.profile_id = ranked.profile_id
`
	_, err := tx.ExecContext(ctx, q, runID)
	return err
}

func titleSlug(slug string) string {
	switch slug {
	case "edc":
		return "EDC"
	default:
		if len(slug) == 0 {
			return ""
		}
		return strings.ToUpper(slug[:1]) + slug[1:]
	}
}

func truncate(v string, max int) string {
	if len(v) <= max {
		return v
	}
	return v[:max]
}
