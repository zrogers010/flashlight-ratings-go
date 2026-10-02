import Link from "next/link";
import { BuyOnAmazonButton } from "./BuyOnAmazonButton";
import { ScoreBadge } from "./ScoreBadge";
import { SpecBadge } from "./SpecBadge";
import { CompareToggle } from "./CompareToggle";
import { ImageWithFallback } from "./ImageWithFallback";
import { QuickSpecTooltip } from "./QuickSpecTooltip";
import type { FlashlightItem } from "@/lib/api";
import { getPriceFreshness } from "@/lib/price-freshness";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function bestScore(item: FlashlightItem) {
  if (item.overall_score && item.overall_score > 0) return item.overall_score;
  return Math.max(
    item.tactical_score || 0,
    item.edc_score || 0,
    item.value_score || 0,
    item.throw_score || 0,
    item.flood_score || 0
  );
}

const TAG_COLORS: Record<string, string> = {
  tactical: "badge-red",
  edc: "badge-blue",
  camping: "badge-green",
  diving: "badge-cyan",
  "search-rescue": "badge-orange",
  survival: "badge-orange",
  "weapon-mount": "badge-red",
  keychain: "badge-blue",
  value: "badge-teal",
};

const TAG_LABELS: Record<string, string> = {
  tactical: "Tactical",
  edc: "Everyday Carry",
  camping: "Camping & Outdoors",
  diving: "Diving & Maritime",
  "search-rescue": "Search & Rescue",
  survival: "Survival",
  "weapon-mount": "Weapon Mount",
  keychain: "Keychain",
  value: "Value",
};

export function FlashlightCard({ item, rank }: { item: FlashlightItem; rank?: number }) {
  const score = bestScore(item);
  // Link to the slug-based review page (canonical URL). Falling back to the
  // numeric-ID page is only for legacy items missing a slug; that page now
  // noindexes itself, so we'd rather always reach the indexable URL.
  const href = item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`;
  const primaryBattery = item.battery_types?.[0];
  const tags = (item.use_case_tags || []).slice(0, 2);
  const priceFresh = getPriceFreshness(item.price_last_updated_at);
  const inStock = item.in_stock !== undefined && item.in_stock !== null ? item.in_stock : item.amazon_in_stock;
  const isOutOfStock = item.availability_status === 'out_of_stock';
  const primaryUnavailable = !item.amazon_url || inStock === false;
  const hasAlternate = item.in_stock_alternate != null;

  return (
    <article
      className={`product-card product-card--tooltip${isOutOfStock ? " product-card--oos" : ""}`}
      data-product={`${item.brand} ${item.name}`}
      data-brand={item.brand}
    >
      <Link href={href} className="card-link-overlay" aria-label={`View ${item.brand} ${item.name} details`} />

      <div className="image-card">
        <ImageWithFallback src={item.image_url} alt={`${item.brand} ${item.name}`} />
        {isOutOfStock && (
          <span className="oos-badge">Out of stock</span>
        )}
        {!isOutOfStock && priceFresh?.showCardBadge && (
          <span className="price-fresh-badge">Checked today</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          {rank !== undefined && <p className="kicker">#{rank}</p>}
          <p className="kicker">{item.brand}</p>
          <h3 style={{ fontSize: "1.05rem" }}>
            {item.name}
            {item.model_code ? <span className="muted" style={{ fontWeight: 400 }}> {item.model_code}</span> : null}
          </h3>
        </div>
        {score > 0 && <ScoreBadge score={score} size="sm" />}
      </div>

      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map((t) => (
            <span key={t} className={`badge ${TAG_COLORS[t] || "badge-teal"}`}>
              {TAG_LABELS[t] || t}
            </span>
          ))}
        </div>
      )}

      <div className="spec-row">
        {item.max_lumens != null && item.max_lumens > 1 && <SpecBadge type="lumens" value={`${fmt(item.max_lumens)} lm`} />}
        {item.beam_distance_m != null && item.beam_distance_m > 0 && <SpecBadge type="throw" value={`${fmt(item.beam_distance_m)} m`} />}
        {primaryBattery && <SpecBadge type="battery" value={primaryBattery} />}
        {item.waterproof_rating && <SpecBadge type="water" value={item.waterproof_rating} />}
      </div>

      <div className="cta-row">
        <CompareToggle
          id={item.id}
          slug={item.slug}
          brand={item.brand}
          name={item.name}
          image_url={item.image_url}
        />
        <div style={{ marginLeft: "auto" }}>
          <BuyOnAmazonButton
            amazon_url={item.amazon_url}
            price_usd={item.price_usd}
            priceUpdatedAt={item.price_last_updated_at}
            inStock={inStock}
            showFreshness={false}
          />
        </div>
      </div>

      {primaryUnavailable && hasAlternate && item.in_stock_alternate && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <strong style={{ fontSize: "0.78rem", color: "var(--teal)" }}>Best available alternative:</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {item.in_stock_alternate.affiliate_url ? (
              <a
                href={item.in_stock_alternate.affiliate_url}
                target="_blank"
                rel="nofollow sponsored noopener noreferrer"
                className="buy-amazon-btn"
                style={{ fontSize: "0.74rem", padding: "5px 10px", position: "relative", zIndex: 2 }}
              >
                {item.in_stock_alternate.brand_name} {item.in_stock_alternate.name}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ) : null}
            <Link
              href={`/reviews/${item.in_stock_alternate.slug}`}
              className="chip chip-alt"
              style={{ fontSize: "0.74rem", display: "inline-block", position: "relative", zIndex: 2 }}
            >
              {item.in_stock_alternate.brand_name} {item.in_stock_alternate.name} review
            </Link>
          </div>
        </div>
      )}

      <QuickSpecTooltip item={item} />
    </article>
  );
}
