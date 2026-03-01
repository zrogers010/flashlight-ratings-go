import Link from "next/link";
import { AmazonCTA } from "./AmazonCTA";
import { ScoreBadge } from "./ScoreBadge";
import { ImageWithFallback } from "./ImageWithFallback";
import type { FlashlightItem } from "@/lib/api";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function bestUseCase(item: FlashlightItem) {
  const scores = [
    { label: "Tactical", v: item.tactical_score || 0 },
    { label: "EDC", v: item.edc_score || 0 },
    { label: "Value", v: item.value_score || 0 },
    { label: "Throw", v: item.throw_score || 0 },
    { label: "Flood", v: item.flood_score || 0 }
  ];
  scores.sort((a, b) => b.v - a.v);
  return scores[0]?.v > 0 ? scores[0].label : null;
}

function topScore(item: FlashlightItem) {
  return Math.max(
    item.tactical_score || 0,
    item.edc_score || 0,
    item.value_score || 0,
    item.throw_score || 0,
    item.flood_score || 0
  );
}

export function FlashlightCard({ item, rank }: { item: FlashlightItem; rank?: number }) {
  const score = topScore(item);
  const useCase = bestUseCase(item);
  const href = `/flashlights/${item.id}`;

  return (
    <article className="product-card">
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

      {useCase && <span className="badge badge-teal">Best for {useCase}</span>}

      <div className="spec-row">
        <span>{fmt(item.max_lumens)} lm</span>
        <span>{fmt(item.beam_distance_m)} m</span>
        {item.waterproof_rating && <span>{item.waterproof_rating}</span>}
      </div>

      {item.price_usd !== undefined && (
        <p className="card-price">${fmt(item.price_usd, 2)}</p>
      )}

      <div className="cta-row">
        <AmazonCTA href={item.amazon_url} price={item.price_usd} />
      </div>
    </article>
  );
}
