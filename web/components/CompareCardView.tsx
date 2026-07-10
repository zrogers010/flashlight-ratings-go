"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ImageWithFallback } from "./ImageWithFallback";
import { BuyOnAmazonButton } from "./BuyOnAmazonButton";
import { ScoreBadge } from "./ScoreBadge";
import { CompareTable } from "./CompareTable";
import type { FlashlightDetail } from "@/lib/api";
import { productUrl } from "@/lib/compare-url";

type Props = {
  items: FlashlightDetail[];
  showFullSpecsToggle?: boolean;
};

const PROFILES: { key: keyof FlashlightDetail; label: string; short: string }[] = [
  { key: "tactical_score", label: "Tactical", short: "Tactical" },
  { key: "edc_score", label: "Everyday Carry", short: "EDC" },
  { key: "value_score", label: "Value", short: "Value" },
  { key: "throw_score", label: "Throw", short: "Throw" },
  { key: "flood_score", label: "Flood", short: "Flood" },
];

type WinnerEntry = { profileKey: string; profileLabel: string; itemId: number; score: number; second?: number };

function fmt(v?: number, digits = 0) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function topScore(item: FlashlightDetail): number {
  return Math.max(
    item.tactical_score || 0,
    item.edc_score || 0,
    item.value_score || 0,
    item.throw_score || 0,
    item.flood_score || 0
  );
}

function computeWinners(items: FlashlightDetail[]): WinnerEntry[] {
  return PROFILES.map((p) => {
    let bestId = -1;
    let bestScore = -1;
    let secondScore = -1;
    for (const item of items) {
      const s = (item[p.key] as number | undefined) || 0;
      if (s > bestScore) {
        secondScore = bestScore;
        bestScore = s;
        bestId = item.id;
      } else if (s > secondScore) {
        secondScore = s;
      }
    }
    return {
      profileKey: String(p.key),
      profileLabel: p.label,
      itemId: bestId,
      score: bestScore,
      second: secondScore >= 0 ? secondScore : undefined,
    };
  }).filter((w) => w.score > 0);
}

function winnerProfilesForItem(itemId: number, winners: WinnerEntry[]): WinnerEntry[] {
  return winners.filter((w) => w.itemId === itemId);
}

export function CompareCardView({ items, showFullSpecsToggle = true }: Props) {
  const [showFullSpecs, setShowFullSpecs] = useState(true);

  const winners = useMemo(() => computeWinners(items), [items]);
  const columnCount = items.length;
  const gridClass =
    columnCount === 2
      ? "compare-card-grid compare-card-grid-2"
      : columnCount === 3
      ? "compare-card-grid compare-card-grid-3"
      : "compare-card-grid compare-card-grid-4plus";

  return (
    <div className="compare-card-view">
      <div className={gridClass}>
        {items.map((item) => {
          const wins = winnerProfilesForItem(item.id, winners);
          const score = topScore(item);
          const name = `${item.brand} ${item.name}`;
          const isWinner = wins.length > 0;
          const winnerSummary = isWinner
            ? `Best ${wins.map((w) => w.profileLabel).join(" + ")}`
            : undefined;
          return (
            <article
              key={item.id}
              className={`compare-card${isWinner ? " compare-card--winner" : ""}`}
              title={winnerSummary}
            >
              <div className="compare-card-image">
                <ImageWithFallback src={item.image_url} alt={name} />
              </div>
              <div className="compare-card-headline">
                <p className="kicker" style={{ marginBottom: 2 }}>{item.brand}</p>
                <h3 style={{ fontSize: "1.05rem", margin: 0 }}>
                  <Link href={productUrl(item)}>{item.name}</Link>
                </h3>
              </div>
              <div className="compare-card-meta">
                {score > 0 ? <ScoreBadge score={score} size="sm" /> : null}
                {item.amazon_average_rating ? (
                  <div className="compare-card-rating">
                    <span className="compare-card-rating-stars" aria-hidden>★</span>
                    <span className="compare-card-rating-value">
                      {item.amazon_average_rating.toFixed(1)}
                    </span>
                    {item.amazon_rating_count ? (
                      <span className="muted compare-card-rating-count">
                        ({item.amazon_rating_count.toLocaleString()})
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <dl className="compare-card-specs">
                <div>
                  <dt>Lumens</dt>
                  <dd>{item.max_lumens ? `${fmt(item.max_lumens)} lm` : "—"}</dd>
                </div>
                <div>
                  <dt>Throw</dt>
                  <dd>{item.beam_distance_m ? `${fmt(item.beam_distance_m)} m` : "—"}</dd>
                </div>
                <div>
                  <dt>Runtime (High)</dt>
                  <dd>{item.runtime_high_min ? `${fmt(item.runtime_high_min)} min` : "—"}</dd>
                </div>
                <div>
                  <dt>Weight</dt>
                  <dd>{item.weight_g ? `${fmt(item.weight_g)} g` : "—"}</dd>
                </div>
                <div>
                  <dt>Battery</dt>
                  <dd>{item.battery_types?.[0] || "—"}</dd>
                </div>
              </dl>
              <div className="compare-card-cta">
                <BuyOnAmazonButton
                  amazon_url={item.amazon_url}
                  price_usd={item.price_usd}
                  size="sm"
                  priceUpdatedAt={item.price_last_updated_at}
                />
              </div>
            </article>
          );
        })}
      </div>

      {winners.length > 0 ? (
        <div className="panel compare-verdict-panel">
          <h3 style={{ marginBottom: 12, fontSize: "1.05rem" }}>Winner by Profile</h3>
          <ul className="compare-verdict-list">
            {winners.map((w) => {
              const winnerItem = items.find((i) => i.id === w.itemId);
              if (!winnerItem) return null;
              const margin = w.second !== undefined && w.second > 0
                ? ` (${w.score.toFixed(1)} vs ${w.second.toFixed(1)})`
                : ` (${w.score.toFixed(1)})`;
              return (
                <li key={w.profileKey}>
                  <span className="compare-verdict-label">{w.profileLabel}:</span>{" "}
                  <Link href={productUrl(winnerItem)}>
                    {winnerItem.brand} {winnerItem.name}
                  </Link>
                  <span className="muted compare-verdict-margin">{margin}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {showFullSpecsToggle ? (
        <div className="panel compare-fullspecs-panel">
          <button
            type="button"
            className="compare-fullspecs-toggle"
            onClick={() => setShowFullSpecs((v) => !v)}
            aria-expanded={showFullSpecs}
          >
            <span>{showFullSpecs ? "Hide" : "Show"} full spec comparison</span>
            <span className="compare-fullspecs-chevron" aria-hidden>
              {showFullSpecs ? "▾" : "▸"}
            </span>
          </button>
          {showFullSpecs ? (
            <div style={{ marginTop: 16 }}>
              <CompareTable items={items} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sticky-buy-bar" role="region" aria-label="Quick buy actions">
        {items.map((item) => (
          <div key={item.id} className="sticky-buy-bar-item">
            <span className="sticky-buy-bar-label">{item.brand}</span>
            <BuyOnAmazonButton
              amazon_url={item.amazon_url}
              price_usd={item.price_usd}
              size="sm"
              priceUpdatedAt={item.price_last_updated_at}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
