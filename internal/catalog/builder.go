package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

type Builder struct {
	db         *sql.DB
	partnerTag string
}

type BuildResult struct {
	Brands     int
	Products   int
	Images     int
	Affiliates int
}

func NewBuilder(db *sql.DB, partnerTag string) *Builder {
	return &Builder{db: db, partnerTag: partnerTag}
}

func (b *Builder) Build(ctx context.Context, cat *Catalog) (*BuildResult, error) {
	tx, err := b.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	result := &BuildResult{}

	if err := b.ensureSchema(ctx, tx); err != nil {
		return nil, fmt.Errorf("ensure schema: %w", err)
	}

	brandIDs, err := b.upsertBrands(ctx, tx, cat.Products)
	if err != nil {
		return nil, fmt.Errorf("upsert brands: %w", err)
	}
	result.Brands = len(brandIDs)

	useCaseIDs, err := b.upsertUseCases(ctx, tx, cat.Products)
	if err != nil {
		return nil, fmt.Errorf("upsert use cases: %w", err)
	}

	if err := b.upsertBatteryTypes(ctx, tx, cat.Products); err != nil {
		return nil, fmt.Errorf("upsert battery types: %w", err)
	}

	for _, p := range cat.Products {
		brandID, ok := brandIDs[p.BrandSlug]
		if !ok {
			return nil, fmt.Errorf("brand not found for slug %q", p.BrandSlug)
		}

		fID, err := b.upsertFlashlight(ctx, tx, p, brandID)
		if err != nil {
			return nil, fmt.Errorf("upsert flashlight %s: %w", p.Slug, err)
		}

		if err := b.upsertSpecs(ctx, tx, fID, p.Specs); err != nil {
			return nil, fmt.Errorf("upsert specs for %s: %w", p.Slug, err)
		}

		n, err := b.replaceMedia(ctx, tx, fID, p)
		if err != nil {
			return nil, fmt.Errorf("replace media for %s: %w", p.Slug, err)
		}
		result.Images += n

		if p.ASIN != "" {
			if err := b.upsertAffiliateLink(ctx, tx, fID, p); err != nil {
				return nil, fmt.Errorf("upsert affiliate for %s: %w", p.Slug, err)
			}
			result.Affiliates++
		}

		if p.PriceUSD > 0 && p.ASIN != "" {
			if err := b.insertPriceSnapshot(ctx, tx, fID, p); err != nil {
				return nil, fmt.Errorf("price snapshot for %s: %w", p.Slug, err)
			}
			if err := b.insertAmazonSnapshot(ctx, tx, fID, p); err != nil {
				return nil, fmt.Errorf("amazon snapshot for %s: %w", p.Slug, err)
			}
		}

		if err := b.upsertUseCaseMapping(ctx, tx, fID, p.UseCases, useCaseIDs); err != nil {
			return nil, fmt.Errorf("use case mapping for %s: %w", p.Slug, err)
		}

		if p.Specs.BatteryType != "" {
			if err := b.upsertBatteryCompat(ctx, tx, fID, p.Specs); err != nil {
				return nil, fmt.Errorf("battery compat for %s: %w", p.Slug, err)
			}
		}

		result.Products++
		log.Printf("  %s %s (id=%d, %d images)", p.Brand, p.Name, fID, len(p.Images))
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return result, nil
}

func (b *Builder) ensureSchema(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `
		ALTER TABLE flashlights
		  ADD COLUMN IF NOT EXISTS msrp_usd NUMERIC(12,2) CHECK (msrp_usd > 0);
		ALTER TABLE flashlight_specs
		  ADD COLUMN IF NOT EXISTS sustained_lumens INTEGER CHECK (sustained_lumens > 0),
		  ADD COLUMN IF NOT EXISTS runtime_500_min INTEGER CHECK (runtime_500_min > 0),
		  ADD COLUMN IF NOT EXISTS turbo_stepdown_sec INTEGER CHECK (turbo_stepdown_sec > 0),
		  ADD COLUMN IF NOT EXISTS beam_pattern TEXT CHECK (beam_pattern IN ('flood', 'throw', 'hybrid')),
		  ADD COLUMN IF NOT EXISTS recharge_type TEXT CHECK (recharge_type IN ('usb-c', 'magnetic', 'none')),
		  ADD COLUMN IF NOT EXISTS battery_replaceable BOOLEAN,
		  ADD COLUMN IF NOT EXISTS body_material TEXT;
		CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_primary
		  ON affiliate_links (flashlight_id, provider, region_code) WHERE is_primary = TRUE;
	`)
	return err
}

func (b *Builder) upsertBrands(ctx context.Context, tx *sql.Tx, products []Product) (map[string]int64, error) {
	ids := make(map[string]int64)
	seen := make(map[string]bool)
	for _, p := range products {
		if seen[p.BrandSlug] {
			continue
		}
		seen[p.BrandSlug] = true
		var id int64
		err := tx.QueryRowContext(ctx, `
			INSERT INTO brands (name, slug, country_code, website_url)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE
			SET name = EXCLUDED.name,
				country_code = COALESCE(EXCLUDED.country_code, brands.country_code),
				website_url = COALESCE(EXCLUDED.website_url, brands.website_url)
			RETURNING id
		`, p.Brand, p.BrandSlug, nullStr(p.BrandCountry), nullStr(p.BrandWebsite)).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("brand %q: %w", p.BrandSlug, err)
		}
		ids[p.BrandSlug] = id
	}
	return ids, nil
}

func (b *Builder) upsertUseCases(ctx context.Context, tx *sql.Tx, products []Product) (map[string]int64, error) {
	ids := make(map[string]int64)
	seen := make(map[string]bool)
	for _, p := range products {
		for _, raw := range p.UseCases {
			slug := makeSlug(raw)
			if slug == "" || seen[slug] {
				continue
			}
			seen[slug] = true
			name := titleCase(strings.ReplaceAll(slug, "-", " "))
			var id int64
			err := tx.QueryRowContext(ctx, `
				INSERT INTO use_cases (name, slug)
				VALUES ($1, $2)
				ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
				RETURNING id
			`, name, slug).Scan(&id)
			if err != nil {
				return nil, fmt.Errorf("use case %q: %w", slug, err)
			}
			ids[slug] = id
		}
	}
	return ids, nil
}

func (b *Builder) upsertBatteryTypes(ctx context.Context, tx *sql.Tx, products []Product) error {
	seen := make(map[string]bool)
	for _, p := range products {
		bt := strings.ToUpper(strings.TrimSpace(p.Specs.BatteryType))
		if bt == "" || seen[bt] {
			continue
		}
		seen[bt] = true
		rechargeable := p.Specs.RechargeType != "" && p.Specs.RechargeType != "none"
		_, err := tx.ExecContext(ctx, `
			INSERT INTO battery_types (code, rechargeable)
			VALUES ($1, $2)
			ON CONFLICT (code) DO NOTHING
		`, bt, rechargeable)
		if err != nil {
			return fmt.Errorf("battery type %q: %w", bt, err)
		}
	}
	return nil
}

func (b *Builder) upsertFlashlight(ctx context.Context, tx *sql.Tx, p Product, brandID int64) (int64, error) {
	var launchDate *time.Time
	if p.ReleaseYear > 0 {
		t := time.Date(p.ReleaseYear, 1, 1, 0, 0, 0, 0, time.UTC)
		launchDate = &t
	}

	var id int64
	err := tx.QueryRowContext(ctx, `
		INSERT INTO flashlights (brand_id, name, slug, model_code, description, launch_date, msrp_usd, is_active, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
		ON CONFLICT (slug) DO UPDATE
		SET brand_id = EXCLUDED.brand_id,
			name = EXCLUDED.name,
			model_code = COALESCE(EXCLUDED.model_code, flashlights.model_code),
			description = COALESCE(EXCLUDED.description, flashlights.description),
			launch_date = COALESCE(EXCLUDED.launch_date, flashlights.launch_date),
			msrp_usd = COALESCE(EXCLUDED.msrp_usd, flashlights.msrp_usd),
			is_active = TRUE,
			updated_at = NOW()
		RETURNING id
	`, brandID, p.Name, p.Slug, nullStr(p.Code), nullStr(p.Description),
		launchDate, nullFloat(p.MSRP)).Scan(&id)
	return id, err
}

func (b *Builder) upsertSpecs(ctx context.Context, tx *sql.Tx, fID int64, s Specs) error {
	usbC := s.RechargeType == "usb-c"
	rechargeable := s.RechargeType != "" && s.RechargeType != "none"

	_, err := tx.ExecContext(ctx, `
		INSERT INTO flashlight_specs (
			flashlight_id, max_lumens, sustained_lumens, max_candela, beam_distance_m,
			runtime_high_min, runtime_500_min, turbo_stepdown_sec, beam_pattern,
			recharge_type, battery_replaceable, usb_c_rechargeable, battery_rechargeable,
			weight_g, length_mm, head_diameter_mm, body_diameter_mm,
			switch_type, waterproof_rating, impact_resistance_m, body_material,
			led_model, cri,
			has_strobe, has_memory_mode, has_lockout, has_moonlight_mode,
			has_magnetic_tailcap, has_pocket_clip
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			$10, $11, $12, $13,
			$14, $15, $16, $17,
			$18, $19, $20, $21,
			$22, $23,
			$24, $25, $26, $27,
			$28, $29
		)
		ON CONFLICT (flashlight_id) DO UPDATE SET
			max_lumens = COALESCE(EXCLUDED.max_lumens, flashlight_specs.max_lumens),
			sustained_lumens = COALESCE(EXCLUDED.sustained_lumens, flashlight_specs.sustained_lumens),
			max_candela = COALESCE(EXCLUDED.max_candela, flashlight_specs.max_candela),
			beam_distance_m = COALESCE(EXCLUDED.beam_distance_m, flashlight_specs.beam_distance_m),
			runtime_high_min = COALESCE(EXCLUDED.runtime_high_min, flashlight_specs.runtime_high_min),
			runtime_500_min = COALESCE(EXCLUDED.runtime_500_min, flashlight_specs.runtime_500_min),
			turbo_stepdown_sec = COALESCE(EXCLUDED.turbo_stepdown_sec, flashlight_specs.turbo_stepdown_sec),
			beam_pattern = COALESCE(EXCLUDED.beam_pattern, flashlight_specs.beam_pattern),
			recharge_type = COALESCE(EXCLUDED.recharge_type, flashlight_specs.recharge_type),
			battery_replaceable = COALESCE(EXCLUDED.battery_replaceable, flashlight_specs.battery_replaceable),
			usb_c_rechargeable = COALESCE(EXCLUDED.usb_c_rechargeable, flashlight_specs.usb_c_rechargeable),
			battery_rechargeable = COALESCE(EXCLUDED.battery_rechargeable, flashlight_specs.battery_rechargeable),
			weight_g = COALESCE(EXCLUDED.weight_g, flashlight_specs.weight_g),
			length_mm = COALESCE(EXCLUDED.length_mm, flashlight_specs.length_mm),
			head_diameter_mm = COALESCE(EXCLUDED.head_diameter_mm, flashlight_specs.head_diameter_mm),
			body_diameter_mm = COALESCE(EXCLUDED.body_diameter_mm, flashlight_specs.body_diameter_mm),
			switch_type = COALESCE(EXCLUDED.switch_type, flashlight_specs.switch_type),
			waterproof_rating = COALESCE(EXCLUDED.waterproof_rating, flashlight_specs.waterproof_rating),
			impact_resistance_m = COALESCE(EXCLUDED.impact_resistance_m, flashlight_specs.impact_resistance_m),
			body_material = COALESCE(EXCLUDED.body_material, flashlight_specs.body_material),
			led_model = COALESCE(EXCLUDED.led_model, flashlight_specs.led_model),
			cri = COALESCE(EXCLUDED.cri, flashlight_specs.cri),
			has_strobe = COALESCE(EXCLUDED.has_strobe, flashlight_specs.has_strobe),
			has_memory_mode = COALESCE(EXCLUDED.has_memory_mode, flashlight_specs.has_memory_mode),
			has_lockout = COALESCE(EXCLUDED.has_lockout, flashlight_specs.has_lockout),
			has_moonlight_mode = COALESCE(EXCLUDED.has_moonlight_mode, flashlight_specs.has_moonlight_mode),
			has_magnetic_tailcap = COALESCE(EXCLUDED.has_magnetic_tailcap, flashlight_specs.has_magnetic_tailcap),
			has_pocket_clip = COALESCE(EXCLUDED.has_pocket_clip, flashlight_specs.has_pocket_clip)
	`,
		fID, nullInt(s.MaxLumens), nullInt(s.SustainedLumens), nullInt(s.MaxCandela), nullInt(s.BeamDistanceM),
		nullInt(s.RuntimeHighMin), nullInt(s.Runtime500Min), nullInt(s.TurboStepdownSec),
		nullValidStr(s.BeamPattern, "flood", "throw", "hybrid"),
		nullValidStr(s.RechargeType, "usb-c", "magnetic", "none"), s.BatteryReplaceable, usbC, rechargeable,
		nullFloat(s.WeightG), nullFloat(s.LengthMM), nullFloat(s.HeadDiameterMM), nullFloat(s.BodyDiameterMM),
		nullValidStr(s.SwitchType, "tail", "side", "dual", "rotary", "twist"),
		nullStr(s.WaterproofRating), nullFloat(s.ImpactResistanceM), nullStr(s.BodyMaterial),
		nullStr(s.LEDModel), nullInt(s.CRI),
		s.HasStrobe, s.HasMemoryMode, s.HasLockout, s.HasMoonlightMode,
		s.HasMagneticTailcap, s.HasPocketClip,
	)
	return err
}

func (b *Builder) replaceMedia(ctx context.Context, tx *sql.Tx, fID int64, p Product) (int, error) {
	if _, err := tx.ExecContext(ctx, `DELETE FROM flashlight_media WHERE flashlight_id = $1`, fID); err != nil {
		return 0, err
	}
	for i, img := range p.Images {
		alt := img.Alt
		if alt == "" {
			alt = p.Brand + " " + p.Name
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO flashlight_media (flashlight_id, media_type, url, alt_text, sort_order)
			VALUES ($1, 'image', $2, $3, $4)
		`, fID, img.URL, alt, i+1)
		if err != nil {
			return 0, err
		}
	}
	return len(p.Images), nil
}

func (b *Builder) upsertAffiliateLink(ctx context.Context, tx *sql.Tx, fID int64, p Product) error {
	affiliateURL := fmt.Sprintf("https://www.amazon.com/dp/%s?tag=%s", p.ASIN, b.partnerTag)

	_, err := tx.ExecContext(ctx, `
		INSERT INTO affiliate_links (flashlight_id, provider, region_code, affiliate_url, asin, is_primary, is_active, updated_at)
		VALUES ($1, 'amazon', 'US', $2, $3, TRUE, TRUE, NOW())
		ON CONFLICT (flashlight_id, provider, region_code) WHERE is_primary = TRUE
		DO UPDATE SET
			affiliate_url = EXCLUDED.affiliate_url,
			asin = EXCLUDED.asin,
			is_active = TRUE,
			updated_at = NOW()
	`, fID, affiliateURL, p.ASIN)
	if err != nil {
		// Fallback: try update then insert
		res, err2 := tx.ExecContext(ctx, `
			UPDATE affiliate_links
			SET affiliate_url = $3, asin = $4, is_active = TRUE, updated_at = NOW()
			WHERE flashlight_id = $1 AND provider = 'amazon' AND region_code = 'US' AND is_primary = TRUE
		`, fID, "amazon", affiliateURL, p.ASIN)
		if err2 != nil {
			return err
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			_, err2 = tx.ExecContext(ctx, `
				INSERT INTO affiliate_links (flashlight_id, provider, region_code, affiliate_url, asin, is_primary, is_active, updated_at)
				VALUES ($1, 'amazon', 'US', $2, $3, TRUE, TRUE, NOW())
			`, fID, affiliateURL, p.ASIN)
			return err2
		}
	}
	return nil
}

func (b *Builder) insertPriceSnapshot(ctx context.Context, tx *sql.Tx, fID int64, p Product) error {
	_, err := tx.ExecContext(ctx, `
		DELETE FROM flashlight_price_snapshots
		WHERE flashlight_id = $1 AND source = 'amazon' AND source_sku = $2
	`, fID, p.ASIN)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO flashlight_price_snapshots (flashlight_id, source, source_sku, currency_code, price, in_stock, captured_at)
		VALUES ($1, 'amazon', $2, 'USD', $3, TRUE, NOW())
	`, fID, p.ASIN, p.PriceUSD)
	return err
}

func (b *Builder) insertAmazonSnapshot(ctx context.Context, tx *sql.Tx, fID int64, p Product) error {
	payload, _ := json.Marshal(map[string]any{
		"source": "catalog-build",
		"title":  p.Name,
		"brand":  p.Brand,
		"asin":   p.ASIN,
	})
	_, err := tx.ExecContext(ctx, `
		INSERT INTO amazon_product_snapshots (
			flashlight_id, asin, rating_count, average_rating, offer_price,
			currency_code, raw_payload, captured_at
		) VALUES ($1, $2, $3, $4, $5, 'USD', $6::jsonb, NOW())
	`, fID, p.ASIN, nullInt(p.RatingCount), nullFloat(p.AverageRating), nullFloat(p.PriceUSD), string(payload))
	return err
}

func (b *Builder) upsertUseCaseMapping(ctx context.Context, tx *sql.Tx, fID int64, useCases []string, ucIDs map[string]int64) error {
	for _, raw := range useCases {
		slug := makeSlug(raw)
		ucID, ok := ucIDs[slug]
		if !ok {
			continue
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO flashlight_use_cases (flashlight_id, use_case_id, confidence)
			VALUES ($1, $2, 0.9)
			ON CONFLICT (flashlight_id, use_case_id) DO UPDATE SET confidence = EXCLUDED.confidence
		`, fID, ucID)
		if err != nil {
			return err
		}
	}
	return nil
}

func (b *Builder) upsertBatteryCompat(ctx context.Context, tx *sql.Tx, fID int64, s Specs) error {
	bt := strings.ToUpper(strings.TrimSpace(s.BatteryType))
	if bt == "" {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO flashlight_battery_compatibility (flashlight_id, battery_type_id, quantity, is_primary, notes)
		SELECT $1, bt.id, 1, TRUE, 'catalog import'
		FROM battery_types bt
		WHERE bt.code = $2
		ON CONFLICT (flashlight_id, battery_type_id) DO UPDATE
		SET is_primary = TRUE, notes = EXCLUDED.notes
	`, fID, bt)
	return err
}

func nullStr(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func nullInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

func nullFloat(v float64) any {
	if v == 0 {
		return nil
	}
	return v
}

func nullValidStr(s string, valid ...string) any {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, v := range valid {
		if s == v {
			return s
		}
	}
	return nil
}

func titleCase(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
