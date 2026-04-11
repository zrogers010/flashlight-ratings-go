import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { BuyOnAmazonButton } from "@/components/BuyOnAmazonButton";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlightByID, fetchRankings, type FlashlightDetail } from "@/lib/api";

export const dynamic = "force-dynamic";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function winner(
  a: number | undefined,
  b: number | undefined,
  higher: "better" | "worse" = "better"
): "a" | "b" | "tie" {
  if (a === undefined && b === undefined) return "tie";
  if (a === undefined) return higher === "better" ? "b" : "a";
  if (b === undefined) return higher === "better" ? "a" : "b";
  if (a === b) return "tie";
  if (higher === "better") return a > b ? "a" : "b";
  return a < b ? "a" : "b";
}

function topScore(d: FlashlightDetail) {
  return Math.max(d.tactical_score || 0, d.edc_score || 0, d.value_score || 0, d.throw_score || 0, d.flood_score || 0);
}

function bestFor(d: FlashlightDetail) {
  const picks = [
    { label: "Tactical", value: d.tactical_score || 0 },
    { label: "EDC", value: d.edc_score || 0 },
    { label: "Value", value: d.value_score || 0 },
    { label: "Throw", value: d.throw_score || 0 },
    { label: "Flood", value: d.flood_score || 0 },
  ];
  picks.sort((x, y) => y.value - x.value);
  return picks[0]?.label || "General Use";
}

type Params = { "a": string; "b": string };

async function loadPair(params: Params) {
  const idA = params["a"];
  const idB = params["b"];
  if (!idA || !idB) return null;

  try {
    const [a, b] = await Promise.all([fetchFlashlightByID(idA), fetchFlashlightByID(idB)]);
    return { a, b };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const pair = await loadPair(params);
  if (!pair) return { title: "Comparison Not Found" };
  const { a, b } = pair;
  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;
  return {
    title: `${nameA} vs ${nameB} — Side by Side Comparison 2026`,
    description: `Compare the ${nameA} (${fmt(a.max_lumens)} lm, ${fmt(a.beam_distance_m)}m throw) against the ${nameB} (${fmt(b.max_lumens)} lm, ${fmt(b.beam_distance_m)}m throw). Specs, scores, and pricing compared.`,
    alternates: { canonical: `/compare/${params["a"]}-vs-${params["b"]}` },
    openGraph: {
      title: `${nameA} vs ${nameB} — Which Is Better?`,
      description: `Head-to-head comparison of specs, scores, and value.`,
    },
  };
}

type RowDef = {
  label: string;
  valueA: string;
  valueB: string;
  winner: "a" | "b" | "tie";
};

function buildRows(a: FlashlightDetail, b: FlashlightDetail): RowDef[] {
  const rows: RowDef[] = [];
  const add = (
    label: string,
    va: number | undefined,
    vb: number | undefined,
    higher: "better" | "worse",
    format: (v?: number) => string = (v) => fmt(v)
  ) => {
    rows.push({ label, valueA: format(va), valueB: format(vb), winner: winner(va, vb, higher) });
  };

  add("Max Lumens", a.max_lumens, b.max_lumens, "better", (v) => fmt(v));
  add("Max Candela", a.max_candela, b.max_candela, "better", (v) => fmt(v));
  add("Beam Distance", a.beam_distance_m, b.beam_distance_m, "better", (v) => v !== undefined ? `${fmt(v)}m` : "—");
  add("Runtime (High)", a.runtime_high_min, b.runtime_high_min, "better", (v) => v !== undefined ? `${fmt(v)} min` : "—");
  add("Weight", a.weight_g, b.weight_g, "worse", (v) => v !== undefined ? `${fmt(v, 1)}g` : "—");
  add("Length", a.length_mm, b.length_mm, "worse", (v) => v !== undefined ? `${fmt(v, 1)}mm` : "—");
  add("Price", a.price_usd, b.price_usd, "worse", (v) => v !== undefined ? `$${fmt(v, 2)}` : "—");
  add("Tactical Score", a.tactical_score, b.tactical_score, "better", (v) => v !== undefined && v > 0 ? fmt(v, 1) : "—");
  add("EDC Score", a.edc_score, b.edc_score, "better", (v) => v !== undefined && v > 0 ? fmt(v, 1) : "—");
  add("Value Score", a.value_score, b.value_score, "better", (v) => v !== undefined && v > 0 ? fmt(v, 1) : "—");
  add("Throw Score", a.throw_score, b.throw_score, "better", (v) => v !== undefined && v > 0 ? fmt(v, 1) : "—");
  add("Flood Score", a.flood_score, b.flood_score, "better", (v) => v !== undefined && v > 0 ? fmt(v, 1) : "—");

  rows.push({
    label: "IP Rating",
    valueA: a.waterproof_rating || "—",
    valueB: b.waterproof_rating || "—",
    winner: "tie",
  });
  rows.push({
    label: "Battery",
    valueA: a.battery_types?.join(", ") || "—",
    valueB: b.battery_types?.join(", ") || "—",
    winner: "tie",
  });
  rows.push({
    label: "USB-C Charging",
    valueA: a.usb_c_rechargeable ? "Yes" : "No",
    valueB: b.usb_c_rechargeable ? "Yes" : "No",
    winner: "tie",
  });

  return rows;
}

function verdictText(a: FlashlightDetail, b: FlashlightDetail): string {
  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;
  const scoreA = topScore(a);
  const scoreB = topScore(b);
  const bestA = bestFor(a);
  const bestB = bestFor(b);

  if (scoreA > scoreB + 5) {
    return `The ${nameA} takes the edge with a stronger ${bestA.toLowerCase()} profile (${fmt(scoreA, 1)} vs ${fmt(scoreB, 1)}). It's the better pick for ${bestA.toLowerCase()} use. The ${nameB} may still be worth considering for ${bestB.toLowerCase()} applications${(b.price_usd || 0) < (a.price_usd || 0) ? " or if budget is a priority" : ""}.`;
  }
  if (scoreB > scoreA + 5) {
    return `The ${nameB} leads here with a higher ${bestB.toLowerCase()} score (${fmt(scoreB, 1)} vs ${fmt(scoreA, 1)}). Choose it for ${bestB.toLowerCase()} tasks. The ${nameA} is still solid for ${bestA.toLowerCase()}${(a.price_usd || 0) < (b.price_usd || 0) ? " and offers better value" : ""}.`;
  }
  return `These two are closely matched. The ${nameA} scores ${fmt(scoreA, 1)} (best for ${bestA.toLowerCase()}) while the ${nameB} scores ${fmt(scoreB, 1)} (best for ${bestB.toLowerCase()}). Your decision should come down to which use case matters more to you.`;
}

export default async function VsPage({ params }: { params: Params }) {
  const pair = await loadPair(params);
  if (!pair) notFound();
  const { a, b } = pair;

  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;
  const rows = buildRows(a, b);

  const winsA = rows.filter((r) => r.winner === "a").length;
  const winsB = rows.filter((r) => r.winner === "b").length;

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Compare", href: "/compare" },
          { name: `${nameA} vs ${nameB}` },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Compare", href: "/compare" },
          { label: `${a.brand} ${a.name} vs ${b.brand} ${b.name}` },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Head-to-Head Comparison</p>
        <h1>{nameA} vs {nameB}</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          Full spec breakdown, score comparison, and buying recommendation for these two flashlights.
        </p>
      </div>

      {/* Hero cards */}
      <div className="grid grid-2">
        {[a, b].map((item, idx) => {
          const name = `${item.brand} ${item.name}`;
          const score = topScore(item);
          const wins = idx === 0 ? winsA : winsB;
          return (
            <div key={item.id} className="panel" style={{ textAlign: "center" }}>
              {item.image_url && (
                <div style={{ width: 120, height: 120, margin: "0 auto 12px", position: "relative" }}>
                  <ImageWithFallback src={item.image_url} alt={name} />
                </div>
              )}
              <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>
                <Link href={`/flashlights/${item.id}`}>{name}</Link>
              </h2>
              <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
                {fmt(item.max_lumens)} lm · {fmt(item.beam_distance_m)}m throw · {item.waterproof_rating || "—"}
              </p>
              {score > 0 && (
                <p style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>{score.toFixed(1)}<span className="muted" style={{ fontSize: "0.8rem" }}>/100</span></p>
              )}
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                Best for {bestFor(item)} · Wins {wins} spec{wins !== 1 ? "s" : ""}
              </p>
              <BuyOnAmazonButton amazon_url={item.amazon_url} price_usd={item.price_usd} size="lg" />
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Spec-by-Spec Comparison</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spec</th>
                <th>{a.brand} {a.name}</th>
                <th>{b.brand} {b.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                  <td
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: row.winner === "a" ? 700 : 400,
                      color: row.winner === "a" ? "var(--score-high)" : undefined,
                    }}
                  >
                    {row.valueA}
                  </td>
                  <td
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: row.winner === "b" ? 700 : 400,
                      color: row.winner === "b" ? "var(--score-high)" : undefined,
                    }}
                  >
                    {row.valueB}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verdict */}
      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>Our Verdict</h2>
        <p style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>{verdictText(a, b)}</p>
      </div>

      {/* Cross-links */}
      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Explore More</h3>
        <div className="spec-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Link href={`/flashlights/${a.id}`} className="chip">{nameA} Details</Link>
          <Link href={`/flashlights/${b.id}`} className="chip">{nameB} Details</Link>
          <Link href="/best-flashlights/tactical" className="chip">Best Tactical</Link>
          <Link href="/best-flashlights/edc" className="chip">Best EDC</Link>
          <Link href="/best-flashlights/value" className="chip">Best Value</Link>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
