package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
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
	SELECT p.price, p.captured_at
	FROM flashlight_price_snapshots p
	WHERE p.flashlight_id = $1
	  AND p.currency_code = 'USD'
	ORDER BY p.captured_at DESC
	LIMIT 1
),
latest_amazon AS (
	SELECT aps.rating_count, aps.average_rating, aps.captured_at
	FROM amazon_product_snapshots aps
	WHERE aps.flashlight_id = $1
	ORDER BY aps.captured_at DESC
	LIMIT 1
),
latest_affiliate AS (
	SELECT a.affiliate_url, a.asin
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
	(SELECT asin FROM latest_affiliate),
	s.max_lumens,
	s.sustained_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_low_min,
	s.runtime_medium_min,
	s.runtime_high_min,
	s.runtime_turbo_min,
	s.runtime_500_min,
	s.turbo_stepdown_sec,
	s.beam_pattern,
	s.recharge_type,
	s.battery_replaceable,
	s.waterproof_rating,
	s.weight_g,
	s.length_mm,
	s.head_diameter_mm,
	s.body_diameter_mm,
	s.impact_resistance_m,
	s.body_material,
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
	(SELECT captured_at FROM latest_price),
	(SELECT rating_count FROM latest_amazon),
	(SELECT average_rating FROM latest_amazon),
	(SELECT captured_at FROM latest_amazon),
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
	) AS image_urls,
	COALESCE(
		(
			SELECT json_agg(
				json_build_object(
					'name', fm.mode_name,
					'output_lumens', fm.output_lumens,
					'runtime_min', fm.runtime_min,
					'candela', fm.candela,
					'beam_distance_m', fm.beam_distance_m
				)
				ORDER BY fm.mode_order ASC, fm.id ASC
			)
			FROM flashlight_modes fm
			WHERE fm.flashlight_id = f.id
		),
		'[]'::json
	) AS modes,
	COALESCE(
		(
			SELECT json_agg(u.slug ORDER BY u.slug)
			FROM flashlight_use_cases fuc
			JOIN use_cases u ON u.id = fuc.use_case_id
			WHERE fuc.flashlight_id = f.id
		),
		'[]'::json
	) AS use_case_tags
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
WHERE f.id = $1
`

	var (
		item                                                                                                                                          flashlightDetail
		modelCode, desc, imageURL, ip, amazonURL, asin, switchType, ledModel, beamPattern, rechargeType, bodyMaterial                                 sql.NullString
		releaseYear, maxLumens, sustainedLumens, maxCandela, beam, runtimeLow, runtimeMedium, runtimeHi, runtimeTurbo, runtime500, turboStepdown, cri sql.NullInt64
		cctMinK, cctMaxK                                                                                                                              sql.NullInt64
		msrpUSD, weight, lengthMM, headMM, bodyMM, impact, price, amazonAvgRating, tactical, edc, value, throw, flood                                 sql.NullFloat64
		batteryReplaceable, usbC, batteryIncluded, batteryRechargeable                                                                                sql.NullBool
		hasStrobe, hasMemoryMode, hasLockout, hasMoonlight, hasMagTailcap, hasPocketClip                                                              sql.NullBool
		priceUpdatedAt, amazonSyncedAt                                                                                                                sql.NullTime
		amazonRatingCount                                                                                                                             sql.NullInt64
		batteryTypesJSON, imageURLsJSON, modesJSON, useCaseTagsJSON                                                                                   []byte
	)

	if err := s.db.QueryRowContext(ctx, query, id).Scan(
		&item.ID,
		&item.Brand,
		&item.Name,
		&item.Slug,
		&modelCode,
		&releaseYear,
		&msrpUSD,
		&desc,
		&imageURL,
		&amazonURL,
		&asin,
		&maxLumens,
		&sustainedLumens,
		&maxCandela,
		&beam,
		&runtimeLow,
		&runtimeMedium,
		&runtimeHi,
		&runtimeTurbo,
		&runtime500,
		&turboStepdown,
		&beamPattern,
		&rechargeType,
		&batteryReplaceable,
		&ip,
		&weight,
		&lengthMM,
		&headMM,
		&bodyMM,
		&impact,
		&bodyMaterial,
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
		&priceUpdatedAt,
		&amazonRatingCount,
		&amazonAvgRating,
		&amazonSyncedAt,
		&tactical,
		&edc,
		&value,
		&throw,
		&flood,
		&batteryTypesJSON,
		&imageURLsJSON,
		&modesJSON,
		&useCaseTagsJSON,
	); err != nil {
		return flashlightDetail{}, err
	}

	item.ModelCode = nullString(modelCode)
	item.ReleaseYear = nullInt(releaseYear)
	item.MSRPUSD = nullFloat(msrpUSD)
	item.Description = nullString(desc)
	item.ImageURL = nullString(imageURL)
	item.AmazonURL = nullString(amazonURL)
	item.ASIN = nullString(asin)
	item.MaxLumens = nullInt(maxLumens)
	item.SustainedLumens = nullInt(sustainedLumens)
	item.MaxCandela = nullInt(maxCandela)
	item.BeamDistanceM = nullInt(beam)
	item.RuntimeLowMin = nullInt(runtimeLow)
	item.RuntimeMediumMin = nullInt(runtimeMedium)
	item.RuntimeHighMin = nullInt(runtimeHi)
	item.RuntimeTurboMin = nullInt(runtimeTurbo)
	item.Runtime500Min = nullInt(runtime500)
	item.TurboStepdownSec = nullInt(turboStepdown)
	item.BeamPattern = nullString(beamPattern)
	item.RechargeType = nullString(rechargeType)
	item.BatteryReplaceable = nullBool(batteryReplaceable)
	item.Waterproof = nullString(ip)
	item.WeightG = nullFloat(weight)
	item.LengthMM = nullFloat(lengthMM)
	item.HeadDiameterMM = nullFloat(headMM)
	item.BodyDiameterMM = nullFloat(bodyMM)
	item.ImpactResistance = nullFloat(impact)
	item.BodyMaterial = nullString(bodyMaterial)
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
	item.HasTailSwitch = switchHas(item.SwitchType, "tail")
	item.HasSideSwitch = switchHas(item.SwitchType, "side")
	item.LEDModel = nullString(ledModel)
	item.CRI = nullInt(cri)
	item.CCTMinK = nullInt(cctMinK)
	item.CCTMaxK = nullInt(cctMaxK)
	item.PriceUSD = nullFloat(price)
	item.AmazonRatingCount = nullInt(amazonRatingCount)
	item.AmazonAverageRating = nullFloat(amazonAvgRating)
	item.PriceLastUpdatedAt = nullTimeString(priceUpdatedAt)
	item.AmazonLastSyncedAt = nullTimeString(amazonSyncedAt)
	item.TacticalScore = nullFloat(tactical)
	item.EDCScore = nullFloat(edc)
	item.ValueScore = nullFloat(value)
	item.ThrowScore = nullFloat(throw)
	item.FloodScore = nullFloat(flood)
	item.BatteryTypes = decodeJSONStringArray(batteryTypesJSON)
	item.ImageURLs = decodeJSONStringArray(imageURLsJSON)
	item.Modes = decodeModesJSON(modesJSON)
	item.UseCaseTags = decodeJSONStringArray(useCaseTagsJSON)
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

type intelligenceCandidate struct {
	ID               int64
	Brand            string
	Name             string
	Category         string
	ImageURL         *string
	AmazonURL        *string
	PriceUSD         *float64
	MaxLumens        *int64
	MaxCandela       *int64
	BeamDistanceM    *int64
	RuntimeHighMin   *int64
	RuntimeMediumMin *int64
	WeightG          *float64
	LengthMM         *float64
	Waterproof       *string
	BatteryType      *string
	TacticalScore    *float64
	EDCScore         *float64
	ValueScore       *float64
	ThrowScore       *float64
	FloodScore       *float64
}

func (s *Server) createIntelligenceRun(ctx context.Context, req intelligenceRunRequest) (intelligenceRunResponse, error) {
	candidates, err := s.intelligenceCandidates(ctx)
	if err != nil {
		return intelligenceRunResponse{}, err
	}
	ranked := rankIntelligence(candidates, req)
	top := ranked
	if len(top) > 5 {
		top = top[:5]
	}

	resultsJSON, err := json.Marshal(top)
	if err != nil {
		return intelligenceRunResponse{}, err
	}

	const q = `
INSERT INTO intelligence_runs (
	intended_use, budget_usd, battery_preference, size_constraint, algorithm_version, top_results
)
VALUES ($1, $2, $3, $4, 'v1', $5::jsonb)
RETURNING id, created_at
`
	var (
		runID     int64
		createdAt time.Time
	)
	if err := s.db.QueryRowContext(
		ctx,
		q,
		req.IntendedUse,
		req.BudgetUSD,
		req.BatteryPreference,
		req.SizeConstraint,
		string(resultsJSON),
	).Scan(&runID, &createdAt); err != nil {
		return intelligenceRunResponse{}, err
	}

	return intelligenceRunResponse{
		RunID:             runID,
		CreatedAt:         createdAt.UTC().Format(time.RFC3339),
		IntendedUse:       req.IntendedUse,
		BudgetUSD:         req.BudgetUSD,
		BatteryPreference: req.BatteryPreference,
		SizeConstraint:    req.SizeConstraint,
		AlgorithmVersion:  "v1",
		TopResults:        top,
	}, nil
}

func (s *Server) getIntelligenceRunByID(ctx context.Context, id int64) (intelligenceRunResponse, error) {
	const q = `
SELECT
	id,
	created_at,
	intended_use,
	budget_usd,
	battery_preference,
	size_constraint,
	algorithm_version,
	top_results
FROM intelligence_runs
WHERE id = $1
`
	var (
		resp          intelligenceRunResponse
		createdAt     time.Time
		topResultsRaw []byte
	)
	if err := s.db.QueryRowContext(ctx, q, id).Scan(
		&resp.RunID,
		&createdAt,
		&resp.IntendedUse,
		&resp.BudgetUSD,
		&resp.BatteryPreference,
		&resp.SizeConstraint,
		&resp.AlgorithmVersion,
		&topResultsRaw,
	); err != nil {
		return intelligenceRunResponse{}, err
	}
	resp.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if err := json.Unmarshal(topResultsRaw, &resp.TopResults); err != nil {
		resp.TopResults = []intelligenceRunResult{}
	}
	return resp, nil
}

func (s *Server) intelligenceCandidates(ctx context.Context) ([]intelligenceCandidate, error) {
	const q = `
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
),
battery_choice AS (
	SELECT
		fbc.flashlight_id,
		MIN(bt.code) AS battery_code
	FROM flashlight_battery_compatibility fbc
	JOIN battery_types bt ON bt.id = fbc.battery_type_id
	GROUP BY fbc.flashlight_id
)
SELECT
	f.id,
	b.name,
	f.name,
	COALESCE(uc.slug, 'general') AS category,
	lm.url,
	la.affiliate_url,
	lp.price,
	s.max_lumens,
	s.max_candela,
	s.beam_distance_m,
	s.runtime_high_min,
	s.runtime_medium_min,
	s.weight_g,
	s.length_mm,
	s.waterproof_rating,
	bc.battery_code,
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
LEFT JOIN battery_choice bc ON bc.flashlight_id = f.id
LEFT JOIN LATERAL (
	SELECT u.slug
	FROM flashlight_use_cases fuc
	JOIN use_cases u ON u.id = fuc.use_case_id
	WHERE fuc.flashlight_id = f.id
	ORDER BY fuc.confidence DESC, u.slug ASC
	LIMIT 1
) uc ON TRUE
WHERE f.is_active = TRUE
`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]intelligenceCandidate, 0, 32)
	for rows.Next() {
		var (
			item                                                             intelligenceCandidate
			imageURL, amazonURL, waterproof, batteryCode                     sql.NullString
			price, weight, lengthMM, tactical, edc, value, throwScore, flood sql.NullFloat64
			maxLumens, maxCandela, beam, runtimeHigh, runtimeMedium          sql.NullInt64
		)
		if err := rows.Scan(
			&item.ID,
			&item.Brand,
			&item.Name,
			&item.Category,
			&imageURL,
			&amazonURL,
			&price,
			&maxLumens,
			&maxCandela,
			&beam,
			&runtimeHigh,
			&runtimeMedium,
			&weight,
			&lengthMM,
			&waterproof,
			&batteryCode,
			&tactical,
			&edc,
			&value,
			&throwScore,
			&flood,
		); err != nil {
			return nil, err
		}
		item.ImageURL = nullString(imageURL)
		item.AmazonURL = nullString(amazonURL)
		item.PriceUSD = nullFloat(price)
		item.MaxLumens = nullInt(maxLumens)
		item.MaxCandela = nullInt(maxCandela)
		item.BeamDistanceM = nullInt(beam)
		item.RuntimeHighMin = nullInt(runtimeHigh)
		item.RuntimeMediumMin = nullInt(runtimeMedium)
		item.WeightG = nullFloat(weight)
		item.LengthMM = nullFloat(lengthMM)
		item.Waterproof = nullString(waterproof)
		item.BatteryType = nullString(batteryCode)
		item.TacticalScore = nullFloat(tactical)
		item.EDCScore = nullFloat(edc)
		item.ValueScore = nullFloat(value)
		item.ThrowScore = nullFloat(throwScore)
		item.FloodScore = nullFloat(flood)
		out = append(out, item)
	}
	return out, rows.Err()
}

func rankIntelligence(candidates []intelligenceCandidate, req intelligenceRunRequest) []intelligenceRunResult {
	out := make([]intelligenceRunResult, 0, len(candidates))
	for _, c := range candidates {
		use := intelligenceUseCaseScore(c, req.IntendedUse)
		budget := intelligenceBudgetScore(c, req.BudgetUSD)
		battery := intelligenceBatteryScore(c, req.BatteryPreference)
		size := intelligenceSizeScore(c, req.SizeConstraint)
		total := use*0.55 + budget*0.2 + battery*0.15 + size*0.1
		out = append(out, intelligenceRunResult{
			ModelID:           c.ID,
			Brand:             c.Brand,
			Name:              c.Name,
			Category:          c.Category,
			ImageURL:          c.ImageURL,
			AmazonURL:         c.AmazonURL,
			PriceUSD:          c.PriceUSD,
			MaxLumens:         c.MaxLumens,
			MaxCandela:        c.MaxCandela,
			BeamDistanceM:     c.BeamDistanceM,
			RuntimeHighMin:    c.RuntimeHighMin,
			RuntimeMediumMin:  c.RuntimeMediumMin,
			WeightG:           c.WeightG,
			LengthMM:          c.LengthMM,
			WaterproofRating:  c.Waterproof,
			BatteryType:       c.BatteryType,
			OverallScore:      round1(total),
			UseCaseScore:      round1(use),
			BudgetScore:       round1(budget),
			BatteryMatchScore: round1(battery),
			SizeFitScore:      round1(size),
			TacticalScore:     c.TacticalScore,
			EDCScore:          c.EDCScore,
			ValueScore:        c.ValueScore,
			ThrowScore:        c.ThrowScore,
			FloodScore:        c.FloodScore,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].OverallScore > out[j].OverallScore
	})
	return out
}

func intelligenceUseCaseScore(c intelligenceCandidate, use string) float64 {
	tactical := valOr(c.TacticalScore, 0)
	edc := valOr(c.EDCScore, 0)
	value := valOr(c.ValueScore, 0)
	throwScore := valOr(c.ThrowScore, 0)
	flood := valOr(c.FloodScore, 0)
	switch use {
	case "tactical", "law-enforcement", "weapon-mount":
		return tactical*0.65 + throwScore*0.35
	case "camping":
		return flood*0.5 + value*0.3 + edc*0.2
	case "search-rescue":
		return throwScore*0.5 + tactical*0.3 + flood*0.2
	case "keychain", "edc":
		return edc
	default:
		return edc
	}
}

func intelligenceBudgetScore(c intelligenceCandidate, budget float64) float64 {
	price := valOr(c.PriceUSD, 999999)
	if price <= budget {
		headroom := (budget - price) / math.Max(budget, 1)
		return math.Min(100, 88+headroom*12)
	}
	over := (price - budget) / math.Max(budget, 1)
	return math.Max(0, 90-over*140)
}

func intelligenceBatteryScore(c intelligenceCandidate, pref string) float64 {
	if pref == "any" {
		return 80
	}
	b := strings.ToLower(strings.TrimSpace(valOrString(c.BatteryType, "")))
	if strings.Contains(b, pref) {
		return 100
	}
	return 15
}

func intelligenceSizeScore(c intelligenceCandidate, size string) float64 {
	if size == "any" {
		return 80
	}
	length := valOr(c.LengthMM, 9999)
	weight := valOr(c.WeightG, 9999)
	switch size {
	case "pocket":
		if length <= 115 && weight <= 100 {
			return 100
		}
		if length <= 125 && weight <= 130 {
			return 70
		}
		return 20
	case "compact":
		if length <= 130 && weight <= 150 {
			return 100
		}
		if length <= 145 && weight <= 180 {
			return 75
		}
		return 40
	case "full-size":
		if length >= 130 {
			return 100
		}
		return 60
	default:
		return 80
	}
}

func valOr(v *float64, fallback float64) float64 {
	if v == nil {
		return fallback
	}
	return *v
}

func valOrString(v *string, fallback string) string {
	if v == nil {
		return fallback
	}
	return *v
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
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

func nullTimeString(v sql.NullTime) *string {
	if !v.Valid {
		return nil
	}
	out := v.Time.UTC().Format(time.RFC3339)
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

func decodeModesJSON(raw []byte) []flashlightMode {
	if len(raw) == 0 {
		return []flashlightMode{}
	}
	var out []flashlightMode
	if err := json.Unmarshal(raw, &out); err != nil {
		return []flashlightMode{}
	}
	return out
}

func switchHas(s *string, needle string) *bool {
	if s == nil {
		return nil
	}
	v := strings.ToLower(strings.TrimSpace(*s))
	out := strings.Contains(v, needle)
	return &out
}
