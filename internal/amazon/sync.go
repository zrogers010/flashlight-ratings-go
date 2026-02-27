package amazon

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type SyncConfig struct {
	Region       string
	PartnerTag   string
	DryRun       bool
	BatchSize    int
	MaxRetries   int
	RetryBackoff time.Duration
}

type Product struct {
	ASIN          string
	RatingCount   *int
	AverageRating *float64
	OfferPrice    *float64
	CurrencyCode  string
	RawPayload    []byte
}

type Client interface {
	LookupItems(ctx context.Context, asins []string) ([]Product, error)
}

type Syncer struct {
	db     *sql.DB
	client Client
	cfg    SyncConfig
}

func NewSyncer(db *sql.DB, client Client, cfg SyncConfig) *Syncer {
	if cfg.Region == "" {
		cfg.Region = "US"
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 10
	}
	if cfg.MaxRetries < 0 {
		cfg.MaxRetries = 0
	}
	if cfg.RetryBackoff <= 0 {
		cfg.RetryBackoff = 750 * time.Millisecond
	}
	return &Syncer{db: db, client: client, cfg: cfg}
}

func (s *Syncer) Run(ctx context.Context) error {
	targets, err := s.loadTargets(ctx)
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		return nil
	}
	if s.cfg.DryRun {
		return nil
	}
	if s.client == nil {
		return errors.New("amazon PA-API client is not configured")
	}

	indexByASIN := make(map[string]int64, len(targets))
	asins := make([]string, 0, len(targets))
	for _, t := range targets {
		indexByASIN[t.ASIN] = t.FlashlightID
		asins = append(asins, t.ASIN)
	}

	for i := 0; i < len(asins); i += s.cfg.BatchSize {
		end := i + s.cfg.BatchSize
		if end > len(asins) {
			end = len(asins)
		}
		chunk := asins[i:end]
		items, err := s.lookupWithRetry(ctx, chunk)
		if err != nil {
			return fmt.Errorf("lookup asins [%s..]: %w", chunk[0], err)
		}
		for _, item := range items {
			flashlightID, ok := indexByASIN[item.ASIN]
			if !ok {
				continue
			}
			if err := s.persistSnapshot(ctx, flashlightID, item); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Syncer) lookupWithRetry(ctx context.Context, asins []string) ([]Product, error) {
	var (
		items []Product
		err   error
	)
	for attempt := 0; attempt <= s.cfg.MaxRetries; attempt++ {
		items, err = s.client.LookupItems(ctx, asins)
		if err == nil {
			return items, nil
		}
		if attempt == s.cfg.MaxRetries {
			break
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(s.cfg.RetryBackoff * time.Duration(attempt+1)):
		}
	}
	return nil, err
}

type targetASIN struct {
	FlashlightID int64
	ASIN         string
}

func (s *Syncer) loadTargets(ctx context.Context) ([]targetASIN, error) {
	const q = `
SELECT DISTINCT ON (al.flashlight_id)
	al.flashlight_id,
	al.asin
FROM affiliate_links al
WHERE al.provider = 'amazon'
  AND al.region_code = $1
  AND al.is_active = TRUE
  AND al.asin IS NOT NULL
ORDER BY al.flashlight_id, al.is_primary DESC, al.updated_at DESC, al.id DESC
`
	rows, err := s.db.QueryContext(ctx, q, s.cfg.Region)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]targetASIN, 0, 128)
	for rows.Next() {
		var row targetASIN
		if err := rows.Scan(&row.FlashlightID, &row.ASIN); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Syncer) persistSnapshot(ctx context.Context, flashlightID int64, p Product) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if p.CurrencyCode == "" {
		p.CurrencyCode = "USD"
	}

	const insertAmazon = `
INSERT INTO amazon_product_snapshots (
	flashlight_id, asin, rating_count, average_rating, offer_price, currency_code, raw_payload, captured_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
`
	var raw string
	if len(p.RawPayload) == 0 {
		raw = "{}"
	} else {
		raw = string(p.RawPayload)
	}
	_, err = tx.ExecContext(
		ctx,
		insertAmazon,
		flashlightID,
		p.ASIN,
		nullInt(p.RatingCount),
		nullFloat(p.AverageRating),
		nullFloat(p.OfferPrice),
		p.CurrencyCode,
		raw,
	)
	if err != nil {
		return err
	}

	if p.OfferPrice != nil && *p.OfferPrice > 0 {
		const insertPrice = `
INSERT INTO flashlight_price_snapshots (
	flashlight_id, source, source_sku, currency_code, price, in_stock, captured_at
)
VALUES ($1, 'amazon', $2, $3, $4, TRUE, NOW())
`
		_, err = tx.ExecContext(ctx, insertPrice, flashlightID, p.ASIN, p.CurrencyCode, *p.OfferPrice)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func nullInt(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func nullFloat(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

type StubClient struct{}

func (c *StubClient) LookupItems(_ context.Context, _ []string) ([]Product, error) {
	return nil, errors.New("PA-API client unavailable in dry-run mode")
}

func NewContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), timeout)
}
