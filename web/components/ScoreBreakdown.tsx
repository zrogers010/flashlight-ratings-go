"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MetricBreakdown } from "@/lib/api";

export type ScoreProfileKey =
  | "overall"
  | "tactical"
  | "edc"
  | "value"
  | "throw"
  | "flood";

type ProfileScores = {
  overall?: number;
  tactical?: number;
  edc?: number;
  value?: number;
  throw?: number;
  flood?: number;
};

type Props = {
  scores: ProfileScores;
  breakdown?: MetricBreakdown | null;
  title?: string;
  description?: string;
  defaultProfile?: ScoreProfileKey;
};

type WeightSpec = { key: string; weight: number };

type MetricRow = {
  key: string;
  label: string;
  weight: number;
  contribution: number;
  rawLabel: string | null;
  normalized?: number;
  hint?: string;
  children?: MetricRow[];
};

const PROFILES: {
  key: ScoreProfileKey;
  label: string;
  blurb: string;
  weights: WeightSpec[];
}[] = [
  {
    key: "overall",
    label: "Overall",
    blurb: "Buyer trust, value, raw performance, and build quality.",
    weights: [
      { key: "amazon_trust", weight: 0.35 },
      { key: "value", weight: 0.25 },
      { key: "performance", weight: 0.25 },
      { key: "durability", weight: 0.15 },
    ],
  },
  {
    key: "tactical",
    label: "Tactical",
    blurb: "Candela, durability, throw, and high-output reliability.",
    weights: [
      { key: "max_candela", weight: 0.25 },
      { key: "durability", weight: 0.2 },
      { key: "amazon_trust", weight: 0.15 },
      { key: "runtime_high_min", weight: 0.15 },
      { key: "throw", weight: 0.15 },
      { key: "max_lumens", weight: 0.1 },
    ],
  },
  {
    key: "edc",
    label: "EDC",
    blurb: "Practical runtime, price, flood usability, and carry-friendly build.",
    weights: [
      { key: "runtime_medium_min", weight: 0.25 },
      { key: "price", weight: 0.2 },
      { key: "amazon_trust", weight: 0.15 },
      { key: "max_lumens", weight: 0.15 },
      { key: "flood", weight: 0.15 },
      { key: "durability", weight: 0.1 },
    ],
  },
  {
    key: "value",
    label: "Value",
    blurb: "Performance relative to price — more capability per dollar scores higher.",
    weights: [
      { key: "perf_blend", weight: 0.55 },
      { key: "price", weight: 0.45 },
    ],
  },
  {
    key: "throw",
    label: "Throw",
    blurb: "Peak intensity and beam distance for long-range use.",
    weights: [
      { key: "max_candela", weight: 0.35 },
      { key: "beam_distance_m", weight: 0.25 },
      { key: "amazon_trust", weight: 0.15 },
      { key: "runtime_high_min", weight: 0.15 },
      { key: "durability", weight: 0.1 },
    ],
  },
  {
    key: "flood",
    label: "Flood",
    blurb: "Wide-area output, sustained runtime, and durability.",
    weights: [
      { key: "max_lumens", weight: 0.35 },
      { key: "runtime_medium_min", weight: 0.2 },
      { key: "amazon_trust", weight: 0.15 },
      { key: "price", weight: 0.15 },
      { key: "durability", weight: 0.15 },
    ],
  },
];

/** Nested ingredients for composite metrics (matches scoring engine v2). */
const COMPOSITE_PARTS: Record<string, WeightSpec[]> = {
  amazon_trust: [
    { key: "amazon_avg_rating", weight: 0.6 },
    { key: "amazon_rating_count", weight: 0.4 },
  ],
  performance: [
    { key: "max_lumens", weight: 0.35 },
    { key: "max_candela", weight: 0.25 },
    { key: "beam_distance_m", weight: 0.2 },
    { key: "runtime_high_min", weight: 0.2 },
  ],
  perf_blend: [
    { key: "max_lumens", weight: 0.4 },
    { key: "runtime_high_min", weight: 0.3 },
    { key: "max_candela", weight: 0.3 },
  ],
  value: [
    { key: "perf_blend", weight: 0.55 },
    { key: "price", weight: 0.45 },
  ],
  throw: [
    { key: "max_candela", weight: 0.35 },
    { key: "beam_distance_m", weight: 0.25 },
    { key: "amazon_trust", weight: 0.15 },
    { key: "runtime_high_min", weight: 0.15 },
    { key: "durability", weight: 0.1 },
  ],
  flood: [
    { key: "max_lumens", weight: 0.35 },
    { key: "runtime_medium_min", weight: 0.2 },
    { key: "amazon_trust", weight: 0.15 },
    { key: "price", weight: 0.15 },
    { key: "durability", weight: 0.15 },
  ],
};

const METRIC_LABELS: Record<string, string> = {
  amazon_trust: "Amazon Trust",
  amazon_avg_rating: "Star Rating",
  amazon_rating_count: "Review Volume",
  performance: "Performance",
  perf_blend: "Performance Blend",
  value: "Value",
  durability: "Durability",
  max_lumens: "Max Lumens",
  max_candela: "Peak Candela",
  beam_distance_m: "Beam Distance",
  runtime_high_min: "High Runtime",
  runtime_medium_min: "Medium Runtime",
  price: "Price",
  price_usd: "Price",
  throw: "Throw Subscore",
  flood: "Flood Subscore",
  tactical: "Tactical",
  edc: "EDC",
  overall: "Overall",
};

const METRIC_HINTS: Record<string, string> = {
  amazon_trust:
    "Buyer social proof from Amazon — 60% star rating + 40% review volume. High stars with few reviews score lower than solid ratings with lots of buyers.",
  performance: "Blend of lumens, candela, throw distance, and high-mode runtime.",
  perf_blend: "Capability mix used for value scoring: lumens, high runtime, and candela.",
  value: "How much performance you get per dollar.",
  durability: "IP waterproof rating and impact resistance.",
  price: "Lower price scores higher on this axis.",
  throw: "Long-range intensity subscore used inside Tactical.",
  flood: "Wide-beam usability subscore used inside EDC.",
};

function scoreTier(v: number) {
  return v >= 80 ? "high" : v >= 60 ? "mid" : "low";
}

function formatRaw(key: string, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  switch (key) {
    case "max_lumens":
      return `${Math.round(value).toLocaleString()} lm`;
    case "max_candela":
      return `${Math.round(value).toLocaleString()} cd`;
    case "beam_distance_m":
      return `${Math.round(value)} m`;
    case "runtime_high_min":
    case "runtime_medium_min":
      return value >= 60
        ? `${(value / 60).toFixed(1)} hr`
        : `${Math.round(value)} min`;
    case "price_usd":
    case "price":
      return `$${value.toFixed(2)}`;
    case "amazon_avg_rating":
      return `${value.toFixed(1)} / 5`;
    case "amazon_rating_count":
      return `${Math.round(value).toLocaleString()} ratings`;
    case "durability":
      return `${value.toFixed(0)} / 100`;
    default:
      return null;
  }
}

function rawLookup(breakdown: MetricBreakdown | null | undefined, key: string) {
  if (!breakdown?.raw) return undefined;
  if (key === "price") return breakdown.raw.price_usd ?? breakdown.raw.price;
  return breakdown.raw[key];
}

function normalizedFor(
  breakdown: MetricBreakdown | null | undefined,
  key: string,
  contribution: number,
  weight: number
): number | undefined {
  const direct = breakdown?.normalized?.[key];
  if (direct !== undefined) return direct;
  if (contribution > 0 && weight > 0) return contribution / weight;
  return undefined;
}

function buildChildren(
  parentKey: string,
  breakdown: MetricBreakdown | null | undefined,
  depth: number
): MetricRow[] | undefined {
  if (depth > 1) return undefined; // avoid deep nesting (e.g. value → perf_blend → …)
  const parts = COMPOSITE_PARTS[parentKey];
  if (!parts || !breakdown) return undefined;

  const weightedGroup = breakdown.weighted?.[parentKey] || {};
  const children: MetricRow[] = [];

  for (const part of parts) {
    const contribution = weightedGroup[part.key] ?? 0;
    const normalized = normalizedFor(
      breakdown,
      part.key,
      contribution,
      part.weight
    );
    if (contribution <= 0 && (normalized === undefined || normalized <= 0)) {
      continue;
    }
    const raw = rawLookup(breakdown, part.key);
    children.push({
      key: `${parentKey}.${part.key}`,
      label: METRIC_LABELS[part.key] || part.key,
      weight: part.weight,
      contribution:
        contribution > 0 ? contribution : (normalized || 0) * part.weight,
      rawLabel: raw !== undefined ? formatRaw(part.key, raw) : null,
      normalized,
      hint: METRIC_HINTS[part.key],
      children:
        part.key !== parentKey
          ? buildChildren(part.key, breakdown, depth + 1)
          : undefined,
    });
  }

  return children.length > 0 ? children : undefined;
}

function buildMetricRows(
  weights: WeightSpec[],
  profileWeighted: Record<string, number>,
  breakdown: MetricBreakdown | null | undefined
): MetricRow[] {
  const rows: MetricRow[] = [];

  for (const w of weights) {
    const contribution = profileWeighted[w.key] ?? 0;
    const normalized = normalizedFor(
      breakdown,
      w.key,
      contribution,
      w.weight
    );
    if (contribution <= 0 && (normalized === undefined || normalized <= 0)) {
      continue;
    }
    const raw = rawLookup(breakdown, w.key);
    rows.push({
      key: w.key,
      label: METRIC_LABELS[w.key] || w.key,
      weight: w.weight,
      contribution:
        contribution > 0 ? contribution : (normalized || 0) * w.weight,
      rawLabel: raw !== undefined ? formatRaw(w.key, raw) : null,
      normalized,
      hint: METRIC_HINTS[w.key],
      children: buildChildren(w.key, breakdown, 0),
    });
  }

  if (rows.length === 0 && breakdown?.normalized) {
    for (const w of weights) {
      const norm = breakdown.normalized?.[w.key];
      if (norm === undefined || norm <= 0) continue;
      const raw = rawLookup(breakdown, w.key);
      rows.push({
        key: w.key,
        label: METRIC_LABELS[w.key] || w.key,
        weight: w.weight,
        contribution: norm * w.weight,
        rawLabel: raw !== undefined ? formatRaw(w.key, raw) : null,
        normalized: norm,
        hint: METRIC_HINTS[w.key],
        children: buildChildren(w.key, breakdown, 0),
      });
    }
  }

  return rows;
}

function profileScore(scores: ProfileScores, key: ScoreProfileKey): number {
  switch (key) {
    case "overall":
      return scores.overall || 0;
    case "tactical":
      return scores.tactical || 0;
    case "edc":
      return scores.edc || 0;
    case "value":
      return scores.value || 0;
    case "throw":
      return scores.throw || 0;
    case "flood":
      return scores.flood || 0;
  }
}

function pickDefaultProfile(
  scores: ProfileScores,
  preferred?: ScoreProfileKey
): ScoreProfileKey {
  if (preferred && profileScore(scores, preferred) > 0) return preferred;
  if ((scores.overall || 0) > 0) return "overall";
  let best: ScoreProfileKey = "tactical";
  let bestVal = 0;
  for (const p of PROFILES) {
    const v = profileScore(scores, p.key);
    if (v > bestVal) {
      bestVal = v;
      best = p.key;
    }
  }
  return best;
}

function MetricBar({
  row,
  maxContribution,
  nested = false,
}: {
  row: MetricRow;
  maxContribution: number;
  nested?: boolean;
}) {
  const widthPct = Math.max(
    4,
    Math.round((row.contribution / Math.max(maxContribution, 1)) * 100)
  );

  return (
    <div className={`score-breakdown-metric${nested ? " is-nested" : ""}`}>
      <div className="score-breakdown-metric-label">
        <span className="score-breakdown-metric-name">
          <span className="score-breakdown-metric-title">
            {row.label}
            <span className="score-breakdown-weight">
              {Math.round(row.weight * 100)}%
            </span>
          </span>
          {row.hint && !nested && (
            <span className="score-breakdown-hint">{row.hint}</span>
          )}
        </span>
        <span className="score-breakdown-metric-values">
          {row.rawLabel && <span className="muted">{row.rawLabel}</span>}
          {row.normalized !== undefined && (
            <strong style={{ color: `var(--score-${scoreTier(row.normalized)})` }}>
              {row.normalized.toFixed(0)}
            </strong>
          )}
        </span>
      </div>
      <div className="bar-track">
        <span
          className={`bar-fill${nested ? "" : " teal"}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {row.children && row.children.length > 0 && (
        <div className="score-breakdown-children">
          {row.children.map((child) => (
            <MetricBar
              key={child.key}
              row={child}
              maxContribution={Math.max(
                ...row.children!.map((c) => c.contribution),
                1
              )}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreBreakdown({
  scores,
  breakdown,
  title = "How It Scores",
  description = "Our algorithm scores every flashlight across six profiles. Select a profile to see which metrics drive the result.",
  defaultProfile,
}: Props) {
  const overview = useMemo(
    () =>
      PROFILES.map((p) => ({
        key: p.key,
        label: p.label,
        value: profileScore(scores, p.key),
      })).filter((p) => p.value > 0),
    [scores]
  );

  const [active, setActive] = useState<ScoreProfileKey>(() =>
    pickDefaultProfile(scores, defaultProfile)
  );

  const activeProfile = PROFILES.find((p) => p.key === active) || PROFILES[0];
  const activeScore = profileScore(scores, activeProfile.key);
  const weighted = breakdown?.weighted?.[activeProfile.key] || {};

  const contributions = useMemo(
    () => buildMetricRows(activeProfile.weights, weighted, breakdown),
    [activeProfile, weighted, breakdown]
  );

  const maxContribution = Math.max(
    ...contributions.map((c) => c.contribution),
    1
  );

  const amazonTrust = useMemo(() => {
    if (!breakdown) return null;
    const rating = breakdown.raw?.amazon_avg_rating;
    const count = breakdown.raw?.amazon_rating_count;
    if (!rating && !count) return null;
    return { rating, count };
  }, [breakdown]);

  if (overview.length === 0) {
    return (
      <div className="panel">
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        <p className="muted" style={{ fontSize: "0.88rem", margin: 0 }}>
          Scores are not available for this flashlight yet.
        </p>
      </div>
    );
  }

  return (
    <div className="panel score-breakdown">
      <div className="score-breakdown-header">
        <div>
          <h2 style={{ marginBottom: 8 }}>{title}</h2>
          <p className="muted" style={{ marginBottom: 0, fontSize: "0.88rem" }}>
            {description}{" "}
            <Link href="/guides/how-we-score" className="score-breakdown-link">
              How we score →
            </Link>
          </p>
        </div>
      </div>

      <div className="score-bars score-breakdown-overview">
        {overview.map((s) => (
          <button
            type="button"
            className={`bar-row score-breakdown-overview-row${
              active === s.key ? " is-active" : ""
            }`}
            key={s.key}
            onClick={() => setActive(s.key)}
            aria-pressed={active === s.key}
          >
            <span className="score-breakdown-overview-label">
              <span>{s.label}</span>
              <strong style={{ color: `var(--score-${scoreTier(s.value)})` }}>
                {s.value.toFixed(1)}
              </strong>
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, Math.round(s.value)))}%`,
                }}
              />
            </span>
          </button>
        ))}
      </div>

      {breakdown && (
        <div className="score-breakdown-detail">
          <div className="score-breakdown-panel">
            <div className="score-breakdown-panel-head">
              <div>
                <p className="score-breakdown-panel-title">
                  {activeProfile.label} score
                </p>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  {activeProfile.blurb}
                </p>
              </div>
              <strong
                className="score-breakdown-panel-score"
                style={{ color: `var(--score-${scoreTier(activeScore)})` }}
              >
                {activeScore > 0 ? activeScore.toFixed(1) : "—"}
              </strong>
            </div>

            {amazonTrust &&
              activeProfile.weights.some((w) => w.key === "amazon_trust") && (
                <aside className="score-breakdown-callout">
                  <strong>Amazon Trust</strong>
                  <span>
                    Combines Amazon star rating
                    {amazonTrust.rating
                      ? ` (${amazonTrust.rating.toFixed(1)}/5)`
                      : ""}{" "}
                    with review volume
                    {amazonTrust.count
                      ? ` (${Math.round(amazonTrust.count).toLocaleString()} ratings)`
                      : ""}
                    . A 4.9 with few reviews scores lower than a 4.6 with
                    thousands — quality and confidence both matter.
                  </span>
                </aside>
              )}

            {contributions.length > 0 ? (
              <div className="score-breakdown-metrics">
                {contributions.map((c) => (
                  <MetricBar
                    key={c.key}
                    row={c}
                    maxContribution={maxContribution}
                  />
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
                Detailed metric contributions are not available for this
                scoring run.
              </p>
            )}

            {breakdown.formula_version && (
              <p className="score-breakdown-formula muted">
                Formula {breakdown.formula_version} · select a profile above ·
                nested rows show what feeds each composite
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
