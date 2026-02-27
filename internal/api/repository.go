package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type flashlightFilters struct {
	BatteryType string
	MinPrice    *float64
	MaxPrice    *float64
	IPRating    string
	SortBy      string
	Order       string
	Page        int
	PageSize    int
}

func (s *Server) listFlashlights(ctx context.Context, f flashlightFilters) ([]flashlightItem, int, error) {
	where, args := buildFlashlightWhere(f)

	sortExpr := sortColumn(f.SortBy)
	order := "DESC"
	if strings.EqualFold(f.Order, "asc") {
		order = "ASC"
	}
	offset := (f.Page - 1) * f.PageSize

	query := fmt.Sprintf(`
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
),
latest_price AS (
	SELECT DISTINCT ON (p.flashlight_id)
		p.flashlight_id,
		p.price
	FROM flashlight_price_snapshots p
	WHERE p.currency_code = 'USD'
	ORDER BY p.flashlight_id, p.captured_at DESC
),
latest_affiliate AS (
	SELECT DISTINCT ON (a.flashlight_id)
		a.flashlight_id,
		a.affiliate_url
	FROM affiliate_links a
	WHERE a.provider = 'amazon'
	  AND a.region_code = 'US'
	  AND a.is_active = TRUE
	ORDER BY a.flashlight_id, a.is_primary DESC, a.updated_at DESC, a.id DESC
),
latest_media AS (
	SELECT DISTINCT ON (m.flashlight_id)
		m.flashlight_id,
		m.url
	FROM flashlight_media m
	WHERE m.media_type = 'image'
	ORDER BY m.flashlight_id, m.sort_order ASC, m.id ASC
),
latest_scores AS (
	SELECT
		fs.flashlight_id,
		MAX(CASE WHEN sp.slug = 'tactical' THEN fs.score END) AS tactical_score,
		MAX(CASE WHEN sp.slug = 'edc' THEN fs.score END) AS edc_score,
		MAX(CASE WHEN sp.slug = 'value' THEN fs.score END) AS value_score,
		MAX(CASE WHEN sp.slug = 'throw' THEN fs.score END) AS throw_score,
		MAX(CASE WHEN sp.slug = 'flood' THEN fs.score END) AS flood_score
	FROM flashlight_scores fs
	JOIN scoring_profiles sp ON sp.id = fs.profile_id
	JOIN latest_run lr ON lr.id = fs.run_id
	GROUP BY fs.flashlight_id
)
SELECT
	f.id,
	b.name,
	f.name,
	f.slug,
	f.model_code,
	f.description,
	lm.url,
	la.affiliate_url,
	s.max_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_high_min,
	s.waterproof_rating,
	lp.price,
	ls.tactical_score,
	ls.edc_score,
	ls.value_score,
	ls.throw_score,
	ls.flood_score
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN latest_affiliate la ON la.flashlight_id = f.id
LEFT JOIN latest_media lm ON lm.flashlight_id = f.id
LEFT JOIN latest_scores ls ON ls.flashlight_id = f.id
%s
ORDER BY %s %s, f.id ASC
LIMIT %d OFFSET %d
`, where, sortExpr, order, f.PageSize, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]flashlightItem, 0, f.PageSize)
	for rows.Next() {
		var (
			item                                      flashlightItem
			maxLumens, maxCandela, beam, runtimeHi    sql.NullInt64
			modelCode, description, imageURL          sql.NullString
			ip, amazonURL                             sql.NullString
			price, tactical, edc, value, throw, flood sql.NullFloat64
		)
		if err := rows.Scan(
			&item.ID,
			&item.Brand,
			&item.Name,
			&item.Slug,
			&modelCode,
			&description,
			&imageURL,
			&amazonURL,
			&maxLumens,
			&maxCandela,
			&beam,
			&runtimeHi,
			&ip,
			&price,
			&tactical,
			&edc,
			&value,
			&throw,
			&flood,
		); err != nil {
			return nil, 0, err
		}
		item.ModelCode = nullString(modelCode)
		item.Description = nullString(description)
		item.ImageURL = nullString(imageURL)
		item.AmazonURL = nullString(amazonURL)
		item.MaxLumens = nullInt(maxLumens)
		item.MaxCandela = nullInt(maxCandela)
		item.BeamDistanceM = nullInt(beam)
		item.RuntimeHighMin = nullInt(runtimeHi)
		item.Waterproof = nullString(ip)
		item.PriceUSD = nullFloat(price)
		item.TacticalScore = nullFloat(tactical)
		item.EDCScore = nullFloat(edc)
		item.ValueScore = nullFloat(value)
		item.ThrowScore = nullFloat(throw)
		item.FloodScore = nullFloat(flood)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	total, err := s.countFlashlights(ctx, where, args)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (s *Server) countFlashlights(ctx context.Context, where string, args []any) (int, error) {
	query := fmt.Sprintf(`
SELECT COUNT(*)
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
LEFT JOIN (
	SELECT DISTINCT ON (p.flashlight_id)
		p.flashlight_id,
		p.price
	FROM flashlight_price_snapshots p
	WHERE p.currency_code = 'USD'
	ORDER BY p.flashlight_id, p.captured_at DESC
) lp ON lp.flashlight_id = f.id
%s
`, where)
	var total int
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Server) getFlashlightByID(ctx context.Context, id int64) (flashlightDetail, error) {
	query := `
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
),
latest_price AS (
	SELECT p.price
	FROM flashlight_price_snapshots p
	WHERE p.flashlight_id = $1
	  AND p.currency_code = 'USD'
	ORDER BY p.captured_at DESC
	LIMIT 1
),
latest_affiliate AS (
	SELECT a.affiliate_url
	FROM affiliate_links a
	WHERE a.flashlight_id = $1
	  AND a.provider = 'amazon'
	  AND a.region_code = 'US'
	  AND a.is_active = TRUE
	ORDER BY a.is_primary DESC, a.updated_at DESC, a.id DESC
	LIMIT 1
),
latest_scores AS (
	SELECT
		MAX(CASE WHEN sp.slug = 'tactical' THEN fs.score END) AS tactical_score,
		MAX(CASE WHEN sp.slug = 'edc' THEN fs.score END) AS edc_score,
		MAX(CASE WHEN sp.slug = 'value' THEN fs.score END) AS value_score,
		MAX(CASE WHEN sp.slug = 'throw' THEN fs.score END) AS throw_score,
		MAX(CASE WHEN sp.slug = 'flood' THEN fs.score END) AS flood_score
	FROM flashlight_scores fs
	JOIN scoring_profiles sp ON sp.id = fs.profile_id
	JOIN latest_run lr ON lr.id = fs.run_id
	WHERE fs.flashlight_id = $1
)
SELECT
	f.id,
	b.name,
	f.name,
	f.slug,
	f.model_code,
	f.description,
	(
		SELECT m.url
		FROM flashlight_media m
		WHERE m.flashlight_id = f.id
		  AND m.media_type = 'image'
		ORDER BY m.sort_order ASC, m.id ASC
		LIMIT 1
	) AS image_url,
	(SELECT affiliate_url FROM latest_affiliate),
	s.max_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_low_min,
	s.runtime_medium_min,
	s.runtime_high_min,
	s.runtime_turbo_min,
	s.waterproof_rating,
	s.weight_g,
	s.length_mm,
	s.head_diameter_mm,
	s.body_diameter_mm,
	s.impact_resistance_m,
	s.usb_c_rechargeable,
	s.battery_included,
	s.battery_rechargeable,
	s.has_strobe,
	s.has_memory_mode,
	s.has_lockout,
	s.has_moonlight_mode,
	s.has_magnetic_tailcap,
	s.has_pocket_clip,
	s.switch_type,
	s.led_model,
	s.cri,
	s.cct_min_k,
	s.cct_max_k,
	(SELECT price FROM latest_price),
	(SELECT tactical_score FROM latest_scores),
	(SELECT edc_score FROM latest_scores),
	(SELECT value_score FROM latest_scores),
	(SELECT throw_score FROM latest_scores),
	(SELECT flood_score FROM latest_scores),
	COALESCE(
		(
			SELECT json_agg(bt.code ORDER BY bt.code)
			FROM flashlight_battery_compatibility fbc
			JOIN battery_types bt ON bt.id = fbc.battery_type_id
			WHERE fbc.flashlight_id = f.id
		),
		'[]'::json
	) AS battery_types,
	COALESCE(
		(
			SELECT json_agg(m.url ORDER BY m.sort_order, m.id)
			FROM flashlight_media m
			WHERE m.flashlight_id = f.id
			  AND m.media_type = 'image'
		),
		'[]'::json
	) AS image_urls
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
WHERE f.id = $1
`

	var (
		item                                                                                 flashlightDetail
		modelCode, desc, imageURL, ip, amazonURL, switchType, ledModel                       sql.NullString
		maxLumens, maxCandela, beam, runtimeLow, runtimeMedium, runtimeHi, runtimeTurbo, cri sql.NullInt64
		cctMinK, cctMaxK                                                                     sql.NullInt64
		weight, lengthMM, headMM, bodyMM, impact, price, tactical, edc, value, throw, flood  sql.NullFloat64
		usbC, batteryIncluded, batteryRechargeable                                           sql.NullBool
		hasStrobe, hasMemoryMode, hasLockout, hasMoonlight, hasMagTailcap, hasPocketClip     sql.NullBool
		batteryTypesJSON, imageURLsJSON                                                      []byte
	)

	if err := s.db.QueryRowContext(ctx, query, id).Scan(
		&item.ID,
		&item.Brand,
		&item.Name,
		&item.Slug,
		&modelCode,
		&desc,
		&imageURL,
		&amazonURL,
		&maxLumens,
		&maxCandela,
		&beam,
		&runtimeLow,
		&runtimeMedium,
		&runtimeHi,
		&runtimeTurbo,
		&ip,
		&weight,
		&lengthMM,
		&headMM,
		&bodyMM,
		&impact,
		&usbC,
		&batteryIncluded,
		&batteryRechargeable,
		&hasStrobe,
		&hasMemoryMode,
		&hasLockout,
		&hasMoonlight,
		&hasMagTailcap,
		&hasPocketClip,
		&switchType,
		&ledModel,
		&cri,
		&cctMinK,
		&cctMaxK,
		&price,
		&tactical,
		&edc,
		&value,
		&throw,
		&flood,
		&batteryTypesJSON,
		&imageURLsJSON,
	); err != nil {
		return flashlightDetail{}, err
	}

	item.ModelCode = nullString(modelCode)
	item.Description = nullString(desc)
	item.ImageURL = nullString(imageURL)
	item.AmazonURL = nullString(amazonURL)
	item.MaxLumens = nullInt(maxLumens)
	item.MaxCandela = nullInt(maxCandela)
	item.BeamDistanceM = nullInt(beam)
	item.RuntimeLowMin = nullInt(runtimeLow)
	item.RuntimeMediumMin = nullInt(runtimeMedium)
	item.RuntimeHighMin = nullInt(runtimeHi)
	item.RuntimeTurboMin = nullInt(runtimeTurbo)
	item.Waterproof = nullString(ip)
	item.WeightG = nullFloat(weight)
	item.LengthMM = nullFloat(lengthMM)
	item.HeadDiameterMM = nullFloat(headMM)
	item.BodyDiameterMM = nullFloat(bodyMM)
	item.ImpactResistance = nullFloat(impact)
	item.USBCRechargeable = nullBool(usbC)
	item.BatteryIncluded = nullBool(batteryIncluded)
	item.BatteryRech = nullBool(batteryRechargeable)
	item.HasStrobe = nullBool(hasStrobe)
	item.HasMemoryMode = nullBool(hasMemoryMode)
	item.HasLockout = nullBool(hasLockout)
	item.HasMoonlightMode = nullBool(hasMoonlight)
	item.HasMagTailcap = nullBool(hasMagTailcap)
	item.HasPocketClip = nullBool(hasPocketClip)
	item.SwitchType = nullString(switchType)
	item.LEDModel = nullString(ledModel)
	item.CRI = nullInt(cri)
	item.CCTMinK = nullInt(cctMinK)
	item.CCTMaxK = nullInt(cctMaxK)
	item.PriceUSD = nullFloat(price)
	item.TacticalScore = nullFloat(tactical)
	item.EDCScore = nullFloat(edc)
	item.ValueScore = nullFloat(value)
	item.ThrowScore = nullFloat(throw)
	item.FloodScore = nullFloat(flood)
	item.BatteryTypes = decodeJSONStringArray(batteryTypesJSON)
	item.ImageURLs = decodeJSONStringArray(imageURLsJSON)
	return item, nil
}

func (s *Server) compareFlashlights(ctx context.Context, ids []int64) ([]flashlightItem, error) {
	ph := makePlaceholders(1, len(ids))
	args := make([]any, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}

	query := fmt.Sprintf(`
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
),
latest_price AS (
	SELECT DISTINCT ON (p.flashlight_id)
		p.flashlight_id,
		p.price
	FROM flashlight_price_snapshots p
	WHERE p.currency_code = 'USD'
	ORDER BY p.flashlight_id, p.captured_at DESC
),
latest_affiliate AS (
	SELECT DISTINCT ON (a.flashlight_id)
		a.flashlight_id,
		a.affiliate_url
	FROM affiliate_links a
	WHERE a.provider = 'amazon'
	  AND a.region_code = 'US'
	  AND a.is_active = TRUE
	ORDER BY a.flashlight_id, a.is_primary DESC, a.updated_at DESC, a.id DESC
),
latest_media AS (
	SELECT DISTINCT ON (m.flashlight_id)
		m.flashlight_id,
		m.url
	FROM flashlight_media m
	WHERE m.media_type = 'image'
	ORDER BY m.flashlight_id, m.sort_order ASC, m.id ASC
),
latest_scores AS (
	SELECT
		fs.flashlight_id,
		MAX(CASE WHEN sp.slug = 'tactical' THEN fs.score END) AS tactical_score,
		MAX(CASE WHEN sp.slug = 'edc' THEN fs.score END) AS edc_score,
		MAX(CASE WHEN sp.slug = 'value' THEN fs.score END) AS value_score,
		MAX(CASE WHEN sp.slug = 'throw' THEN fs.score END) AS throw_score,
		MAX(CASE WHEN sp.slug = 'flood' THEN fs.score END) AS flood_score
	FROM flashlight_scores fs
	JOIN scoring_profiles sp ON sp.id = fs.profile_id
	JOIN latest_run lr ON lr.id = fs.run_id
	GROUP BY fs.flashlight_id
)
SELECT
	f.id,
	b.name,
	f.name,
	f.slug,
	f.model_code,
	f.description,
	lm.url,
	la.affiliate_url,
	s.max_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_high_min,
	s.waterproof_rating,
	lp.price,
	ls.tactical_score,
	ls.edc_score,
	ls.value_score,
	ls.throw_score,
	ls.flood_score
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN latest_affiliate la ON la.flashlight_id = f.id
LEFT JOIN latest_media lm ON lm.flashlight_id = f.id
LEFT JOIN latest_scores ls ON ls.flashlight_id = f.id
WHERE f.id IN (%s)
ORDER BY f.id ASC
`, ph)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]flashlightItem, 0, len(ids))
	for rows.Next() {
		var (
			item                                      flashlightItem
			maxLumens, maxCandela, beam, runtimeHi    sql.NullInt64
			modelCode, description, imageURL          sql.NullString
			ip, amazonURL                             sql.NullString
			price, tactical, edc, value, throw, flood sql.NullFloat64
		)
		if err := rows.Scan(
			&item.ID,
			&item.Brand,
			&item.Name,
			&item.Slug,
			&modelCode,
			&description,
			&imageURL,
			&amazonURL,
			&maxLumens,
			&maxCandela,
			&beam,
			&runtimeHi,
			&ip,
			&price,
			&tactical,
			&edc,
			&value,
			&throw,
			&flood,
		); err != nil {
			return nil, err
		}
		item.ModelCode = nullString(modelCode)
		item.Description = nullString(description)
		item.ImageURL = nullString(imageURL)
		item.AmazonURL = nullString(amazonURL)
		item.MaxLumens = nullInt(maxLumens)
		item.MaxCandela = nullInt(maxCandela)
		item.BeamDistanceM = nullInt(beam)
		item.RuntimeHighMin = nullInt(runtimeHi)
		item.Waterproof = nullString(ip)
		item.PriceUSD = nullFloat(price)
		item.TacticalScore = nullFloat(tactical)
		item.EDCScore = nullFloat(edc)
		item.ValueScore = nullFloat(value)
		item.ThrowScore = nullFloat(throw)
		item.FloodScore = nullFloat(flood)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) rankings(ctx context.Context, useCase string, page, pageSize int) ([]rankedResponse, int, error) {
	offset := (page - 1) * pageSize
	query := `
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
)
SELECT
	fs.rank_position,
	fs.score,
	sp.slug,
	f.id,
	b.name,
	f.name,
	f.slug,
	lm.url,
	la.affiliate_url
FROM flashlight_scores fs
JOIN latest_run lr ON lr.id = fs.run_id
JOIN scoring_profiles sp ON sp.id = fs.profile_id
JOIN flashlights f ON f.id = fs.flashlight_id
JOIN brands b ON b.id = f.brand_id
LEFT JOIN LATERAL (
	SELECT m.url
	FROM flashlight_media m
	WHERE m.flashlight_id = f.id
	  AND m.media_type = 'image'
	ORDER BY m.sort_order ASC, m.id ASC
	LIMIT 1
) lm ON TRUE
LEFT JOIN LATERAL (
	SELECT al.affiliate_url
	FROM affiliate_links al
	WHERE al.flashlight_id = f.id
	  AND al.provider = 'amazon'
	  AND al.region_code = 'US'
	  AND al.is_active = TRUE
	ORDER BY al.is_primary DESC, al.updated_at DESC, al.id DESC
	LIMIT 1
) la ON TRUE
WHERE sp.slug = $1
ORDER BY fs.rank_position ASC, fs.score DESC
LIMIT $2 OFFSET $3
`

	rows, err := s.db.QueryContext(ctx, query, useCase, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]rankedResponse, 0, pageSize)
	for rows.Next() {
		var (
			item                rankedResponse
			imageURL, amazonURL sql.NullString
		)
		if err := rows.Scan(
			&item.Rank,
			&item.Score,
			&item.Profile,
			&item.Flashlight.ID,
			&item.Flashlight.Brand,
			&item.Flashlight.Name,
			&item.Flashlight.Slug,
			&imageURL,
			&amazonURL,
		); err != nil {
			return nil, 0, err
		}
		item.Flashlight.ImageURL = nullString(imageURL)
		item.Flashlight.AmazonURL = nullString(amazonURL)
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	countQuery := `
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
)
SELECT COUNT(*)
FROM flashlight_scores fs
JOIN latest_run lr ON lr.id = fs.run_id
JOIN scoring_profiles sp ON sp.id = fs.profile_id
WHERE sp.slug = $1
`
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, useCase).Scan(&total); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

func (s *Server) finder(ctx context.Context, filters finderFilters, limit int) ([]finderRanking, error) {
	clauses := []string{"f.is_active = TRUE"}
	args := make([]any, 0, 5)
	argn := 1

	if filters.Budget != nil {
		clauses = append(clauses, fmt.Sprintf("lp.price <= $%d", argn))
		args = append(args, *filters.Budget)
		argn++
	}
	if filters.USBC != nil {
		clauses = append(clauses, fmt.Sprintf("s.usb_c_rechargeable = $%d", argn))
		args = append(args, *filters.USBC)
		argn++
	}
	if filters.MinThrow != nil {
		clauses = append(clauses, fmt.Sprintf("s.beam_distance_m >= $%d", argn))
		args = append(args, *filters.MinThrow)
		argn++
	}
	where := "WHERE " + strings.Join(clauses, " AND ")

	query := fmt.Sprintf(`
WITH latest_run AS (
	SELECT id
	FROM scoring_runs
	WHERE status = 'completed'
	ORDER BY completed_at DESC NULLS LAST, id DESC
	LIMIT 1
),
latest_price AS (
	SELECT DISTINCT ON (p.flashlight_id)
		p.flashlight_id,
		p.price
	FROM flashlight_price_snapshots p
	WHERE p.currency_code = 'USD'
	ORDER BY p.flashlight_id, p.captured_at DESC
),
latest_affiliate AS (
	SELECT DISTINCT ON (a.flashlight_id)
		a.flashlight_id,
		a.affiliate_url
	FROM affiliate_links a
	WHERE a.provider = 'amazon'
	  AND a.region_code = 'US'
	  AND a.is_active = TRUE
	ORDER BY a.flashlight_id, a.is_primary DESC, a.updated_at DESC, a.id DESC
),
latest_scores AS (
	SELECT
		fs.flashlight_id,
		MAX(CASE WHEN sp.slug = 'tactical' THEN fs.score END) AS tactical_score,
		MAX(CASE WHEN sp.slug = 'throw' THEN fs.score END) AS throw_score,
		MAX(CASE WHEN sp.slug = 'value' THEN fs.score END) AS value_score
	FROM flashlight_scores fs
	JOIN scoring_profiles sp ON sp.id = fs.profile_id
	JOIN latest_run lr ON lr.id = fs.run_id
	GROUP BY fs.flashlight_id
)
SELECT
	f.id,
	b.name,
	f.name,
	la.affiliate_url,
	lp.price,
	s.beam_distance_m,
	ls.tactical_score,
	ls.throw_score,
	ls.value_score,
	(
		COALESCE(ls.tactical_score, 0) * 0.50 +
		COALESCE(ls.throw_score, 0) * 0.30 +
		COALESCE(ls.value_score, 0) * 0.20
	) AS finder_score
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN latest_affiliate la ON la.flashlight_id = f.id
LEFT JOIN latest_scores ls ON ls.flashlight_id = f.id
%s
ORDER BY finder_score DESC, f.id ASC
LIMIT %d
`, where, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]finderRanking, 0, limit)
	for rows.Next() {
		var (
			item                          finderRanking
			amazonURL                     sql.NullString
			price, tactical, throw, value sql.NullFloat64
			beam                          sql.NullInt64
		)
		if err := rows.Scan(
			&item.FlashlightID,
			&item.Brand,
			&item.Name,
			&amazonURL,
			&price,
			&beam,
			&tactical,
			&throw,
			&value,
			&item.FinderScore,
		); err != nil {
			return nil, err
		}
		item.AmazonURL = nullString(amazonURL)
		item.PriceUSD = nullFloat(price)
		item.BeamDistanceM = nullInt(beam)
		item.TacticalScore = nullFloat(tactical)
		item.ThrowScore = nullFloat(throw)
		item.ValueScore = nullFloat(value)
		out = append(out, item)
	}
	return out, rows.Err()
}

func buildFlashlightWhere(f flashlightFilters) (string, []any) {
	clauses := []string{"f.is_active = TRUE"}
	args := make([]any, 0, 6)
	argn := 1

	if f.BatteryType != "" {
		clauses = append(clauses, fmt.Sprintf(`
EXISTS (
	SELECT 1
	FROM flashlight_battery_compatibility fbc
	JOIN battery_types bt ON bt.id = fbc.battery_type_id
	WHERE fbc.flashlight_id = f.id
	  AND bt.code = $%d
)`, argn))
		args = append(args, strings.ToUpper(f.BatteryType))
		argn++
	}

	if f.MinPrice != nil {
		clauses = append(clauses, fmt.Sprintf("lp.price >= $%d", argn))
		args = append(args, *f.MinPrice)
		argn++
	}
	if f.MaxPrice != nil {
		clauses = append(clauses, fmt.Sprintf("lp.price <= $%d", argn))
		args = append(args, *f.MaxPrice)
		argn++
	}
	if f.IPRating != "" {
		clauses = append(clauses, fmt.Sprintf("s.waterproof_rating = $%d", argn))
		args = append(args, strings.ToUpper(f.IPRating))
		argn++
	}

	return "WHERE " + strings.Join(clauses, " AND "), args
}

func sortColumn(sortBy string) string {
	switch strings.ToLower(strings.TrimSpace(sortBy)) {
	case "price":
		return "lp.price"
	case "max_lumens":
		return "s.max_lumens"
	case "max_candela":
		return "s.max_candela"
	case "runtime_high_min":
		return "s.runtime_high_min"
	case "tactical_score":
		return "ls.tactical_score"
	case "edc_score":
		return "ls.edc_score"
	case "value_score":
		return "ls.value_score"
	case "throw_score":
		return "ls.throw_score"
	case "flood_score":
		return "ls.flood_score"
	default:
		return "ls.tactical_score"
	}
}

func makePlaceholders(start, count int) string {
	parts := make([]string, 0, count)
	for i := 0; i < count; i++ {
		parts = append(parts, "$"+strconv.Itoa(start+i))
	}
	return strings.Join(parts, ",")
}

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	out := v.Int64
	return &out
}

func nullFloat(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	out := v.Float64
	return &out
}

func nullString(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	out := v.String
	return &out
}

func nullBool(v sql.NullBool) *bool {
	if !v.Valid {
		return nil
	}
	out := v.Bool
	return &out
}

func decodeJSONStringArray(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}
