import Link from "next/link";
import { BuyOnAmazonButton } from "./BuyOnAmazonButton";
import { ScoreBadge } from "./ScoreBadge";
import { SpecBadge } from "./SpecBadge";
import { CompareToggle } from "./CompareToggle";
import { ImageWithFallback } from "./ImageWithFallback";
import { QuickSpecTooltip } from "./QuickSpecTooltip";
import type { FlashlightItem } from "@/lib/api";

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
  const href = `/flashlights/${item.id}`;
  const primaryBattery = item.battery_types?.[0];
  const tags = (item.use_case_tags || []).slice(0, 2);

  return (
    <article className="product-card product-card--tooltip">
      <Link href={href} className="card-link-overlay" aria-label={`View ${item.brand} ${item.name} details`} />

      <div className="image-card">
        <ImageWithFallback src={item.image_url} alt={`${item.brand} ${item.name}`} />
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
        <CompareToggle id={item.id} brand={item.brand} name={item.name} image_url={item.image_url} />
        <div style={{ marginLeft: "auto" }}>
          <BuyOnAmazonButton amazon_url={item.amazon_url} price_usd={item.price_usd} />
        </div>
      </div>

      <QuickSpecTooltip item={item} />
    </article>
  );
}
