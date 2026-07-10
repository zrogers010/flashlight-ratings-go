import type { Metadata } from "next";
import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BuyOnAmazonButton } from "@/components/BuyOnAmazonButton";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQ } from "@/components/FAQ";
import { ProductStructuredData, BreadcrumbStructuredData } from "@/components/StructuredData";
import { FlashlightCard } from "@/components/FlashlightCard";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { fetchFlashlightByID, fetchFlashlights, fetchRankings } from "@/lib/api";
import { compareUrl } from "@/lib/compare-url";

export const revalidate = 3600;

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function yesNo(v?: boolean) {
  if (v === undefined) return "—";
  return v ? "Yes" : "No";
}

const BEST_FOR_SLUG: Record<string, string> = {
  Tactical: "tactical",
  EDC: "edc",
  Value: "value",
  Throw: "throw",
  Flood: "flood",
};

function bestForLabel(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const picks = [
    { label: "Tactical", value: data.tactical_score || 0 },
    { label: "EDC", value: data.edc_score || 0 },
    { label: "Value", value: data.value_score || 0 },
    { label: "Throw", value: data.throw_score || 0 },
    { label: "Flood", value: data.flood_score || 0 }
  ];
  picks.sort((a, b) => b.value - a.value);
  return picks[0]?.label || "General Use";
}

function topScore(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  return Math.max(
    data.overall_score || 0,
    data.tactical_score || 0,
    data.edc_score || 0,
    data.value_score || 0,
    data.throw_score || 0,
    data.flood_score || 0
  );
}

function pros(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const out: string[] = [];
  if ((data.max_candela || 0) >= 40000) out.push("Exceptional throw performance for long-range visibility");
  if ((data.max_lumens || 0) >= 2000) out.push("High lumen output for bright, wide illumination");
  if ((data.runtime_medium_min || 0) >= 240) out.push("Solid medium-mode runtime for extended use");
  if (data.usb_c_rechargeable) out.push("Convenient direct USB-C charging");
  if (data.waterproof_rating === "IPX8" || data.waterproof_rating === "IP68") out.push("Top-tier waterproof rating for harsh conditions");
  if ((data.value_score || 0) >= 85) out.push("Outstanding performance-per-dollar value");
  if (data.has_moonlight_mode) out.push("Moonlight mode for dark-adapted vision");
  if (data.has_magnetic_tailcap) out.push("Magnetic tailcap for hands-free use");
  return out.slice(0, 5);
}

function cons(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const out: string[] = [];
  if ((data.weight_g || 0) > 150) out.push("Heavier than typical pocket-carry options");
  else if ((data.weight_g || 0) > 120) out.push("Slightly heavy for everyday pocket carry");
  if (!data.has_lockout) out.push("No lockout mode to prevent accidental activation");
  if (!data.has_pocket_clip) out.push("No pocket clip included");
  if ((data.runtime_high_min || 0) > 0 && (data.runtime_high_min || 0) < 60) out.push("Limited runtime on high mode");
  if (!data.usb_c_rechargeable && !data.battery_rechargeable) out.push("No built-in charging — external charger required");
  if ((data.length_mm || 0) > 160) out.push("Longer form factor may not suit all carry styles");
  return out.slice(0, 4);
}

function generateFAQ(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const name = `${data.brand} ${data.name}`;
  const items: { q: string; a: string }[] = [];

  if (data.waterproof_rating)
    items.push({ q: `Is the ${name} waterproof?`, a: `Yes, the ${name} has a ${data.waterproof_rating} waterproof rating, making it suitable for use in rain and wet conditions.` });
  if (data.battery_types?.length)
    items.push({ q: `What battery does the ${name} use?`, a: `The ${name} uses ${data.battery_types.join(" or ")} batteries.${data.usb_c_rechargeable ? " It supports direct USB-C charging." : ""}` });
  if (data.beam_distance_m)
    items.push({ q: `How far can the ${name} throw?`, a: `The ${name} has a maximum beam distance of ${data.beam_distance_m} meters (${Math.round(data.beam_distance_m * 3.28)} feet) with ${fmt(data.max_candela)} candela.` });
  if (data.max_lumens)
    items.push({ q: `How bright is the ${name}?`, a: `The ${name} produces up to ${fmt(data.max_lumens)} lumens on its highest mode.${data.modes?.length ? ` It has ${data.modes.length} brightness modes.` : ""}` });
  if (data.weight_g)
    items.push({ q: `How much does the ${name} weigh?`, a: `The ${name} weighs ${fmt(data.weight_g, 1)}g (${(data.weight_g / 28.35).toFixed(1)} oz).${data.length_mm ? ` It is ${fmt(data.length_mm, 1)}mm long.` : ""}` });

  return items;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchFlashlightByID(id);
  const name = `${data.brand} ${data.name}`;
  const score = topScore(data);

  const desc = `${name} review: ${fmt(data.max_lumens)} lumens, ${fmt(data.max_candela)} candela, ${fmt(data.beam_distance_m)}m throw. ${data.battery_types?.join("/") || ""} battery, ${data.waterproof_rating || "N/A"} rated. Score: ${score > 0 ? score.toFixed(1) : "N/A"}/100.`;

  // The slug-based /reviews/[slug] page is the canonical URL for SEO. This
  // numeric-ID page exists for backward compatibility (old bookmarks, internal
  // links) but is marked noindex so Google consolidates ranking signals on
  // the slug URL instead of treating the two as duplicate content.
  const canonicalSlug = data.slug;
  return {
    title: `${name} Review — ${fmt(data.max_lumens)} Lumens, ${fmt(data.beam_distance_m)}m Throw${score > 0 ? ` (${score.toFixed(0)}/100)` : ""}`,
    description: desc,
    alternates: canonicalSlug
      ? { canonical: `/reviews/${canonicalSlug}` }
      : { canonical: `/flashlights/${id}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${name} — Flashlight Review & Score`,
      description: `${fmt(data.max_lumens)} lumens · ${fmt(data.beam_distance_m)}m throw · Best for ${bestForLabel(data)}`,
      images: data.image_urls?.length ? [data.image_urls[0]] : data.image_url ? [data.image_url] : undefined
    }
  };
}

export default async function FlashlightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, catalog, tacticalRanks, edcRanks, valueRanks, throwRanks, floodRanks] = await Promise.all([
    fetchFlashlightByID(id),
    fetchFlashlights(),
    fetchRankings("tactical", 3),
    fetchRankings("edc", 3),
    fetchRankings("value", 3),
    fetchRankings("throw", 3),
    fetchRankings("flood", 3),
  ]);

  const rankBadges: { label: string; rank: number }[] = [];
  const allRanks = [
    { label: "Tactical", items: tacticalRanks.items },
    { label: "EDC", items: edcRanks.items },
    { label: "Value", items: valueRanks.items },
    { label: "Throw", items: throwRanks.items },
    { label: "Flood", items: floodRanks.items },
  ];
  for (const cat of allRanks) {
    const match = cat.items.find((r) => r.flashlight.id === data.id);
    if (match) rankBadges.push({ label: cat.label, rank: match.rank });
  }

  const rawImages = data.image_urls?.length ? data.image_urls : data.image_url ? [data.image_url] : [];
  const images = [...new Set(rawImages)].filter((u) => !u.includes("._SCLZZZZZZZ_"));
  const alternatives = catalog.items
    .filter((x) => x.id !== data.id)
    .sort((a, b) =>
      Math.abs((a.price_usd || 0) - (data.price_usd || 0)) -
      Math.abs((b.price_usd || 0) - (data.price_usd || 0))
    )
    .slice(0, 3);

  const positive = pros(data);
  const drawbacks = cons(data);
  const faqItems = generateFAQ(data);
  const score = topScore(data);
  const bestFor = bestForLabel(data);

  return (
    <section className="grid">
      <ProductStructuredData data={data} />
      <BreadcrumbStructuredData items={[{ name: "Best Flashlights", href: "/best-flashlights" }, { name: `${data.brand} ${data.name}` }]} />

      <Breadcrumbs items={[{ label: "Best Flashlights", href: "/best-flashlights" }, { label: `${data.brand} ${data.name}` }]} />

      {/* ── Hero Section ──────────────────────────── */}
      <div className="panel hero detail-hero">
        <div className="detail-hero-main">
          <p className="kicker">
            <Link href={`/brands/${data.brand_slug || data.brand.toLowerCase()}`} style={{ color: "inherit", textDecoration: "none" }}>
              {data.brand}
            </Link>
          </p>
          <h1>
            {data.name}
            {data.model_code ? <span className="muted" style={{ fontWeight: 400 }}> {data.model_code}</span> : null}
          </h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            {data.description || "Detailed specifications and scoring available below."}
          </p>
          {rankBadges.length > 0 && (
            <div className="spec-row" style={{ marginBottom: 8 }}>
              {rankBadges.map((b) => (
                <span key={b.label} className="badge badge-gold">
                  #{b.rank} {b.label}
                </span>
              ))}
            </div>
          )}
          <div className="spec-row" style={{ marginBottom: 8 }}>
            <Link href={`/best-flashlights/${BEST_FOR_SLUG[bestFor] || "tactical"}`} className="badge badge-teal" style={{ textDecoration: "none" }}>Best for {bestFor}</Link>
            <span>{fmt(data.max_lumens)} lm</span>
            <span>{fmt(data.beam_distance_m)} m throw</span>
            <span>{data.waterproof_rating || "—"}</span>
            <span>{fmt(data.weight_g)}g</span>
          </div>
          {data.amazon_average_rating !== undefined && (
            <p className="muted" style={{ fontSize: "0.88rem" }}>
              Amazon: {fmt(data.amazon_average_rating, 1)}/5 ({fmt(data.amazon_rating_count)} ratings)
            </p>
          )}
          <div className="spec-row" style={{ marginTop: 8, fontSize: "0.85rem" }}>
            <Link href={`/reviews/${data.slug}`}>
              Read Full Breakdown →
            </Link>
            <Link href={`/brands/${data.brand_slug || data.brand.toLowerCase()}`}>
              All {data.brand} Flashlights →
            </Link>
            {data.brand_website_url && (
              <a href={data.brand_website_url} target="_blank" rel="noopener noreferrer" className="brand-external-link">
                {data.brand} Official Site ↗
              </a>
            )}
          </div>
        </div>

        <aside className="buy-box">
          {score > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <ScoreBadge score={score} size="lg" />
              <div>
                <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>Score: {score.toFixed(1)}</p>
                <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>Best for {bestFor}</p>
              </div>
            </div>
          )}
          <BuyOnAmazonButton amazon_url={data.amazon_url} price_usd={data.price_usd} size="lg" priceUpdatedAt={data.price_last_updated_at} />
          <div className="buy-meta">
            {data.msrp_usd !== undefined && <span>MSRP: ${fmt(data.msrp_usd, 2)}</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link
              href={compareUrl(alternatives[0] ? [data, alternatives[0]] : [data])}
              className="btn btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Compare Against Another
            </Link>
          </div>
        </aside>
      </div>

      {/* ── Images ────────────────────────────────── */}
      {images.length > 0 && (
        <div className="image-strip">
          {images.map((src, idx) => (
            <div key={`${src}-${idx}`} className="image-card">
              <ImageWithFallback src={src} alt={`${data.brand} ${data.name} — image ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
      )}

      {/* ── Verdict ───────────────────────────────── */}
      {(positive.length > 0 || drawbacks.length > 0) && (
        <div className="panel">
          <h2 style={{ marginBottom: 16 }}>Verdict</h2>
          <div className="verdict-grid">
            <div>
              <h3 style={{ color: "var(--score-high)", fontSize: "0.9rem", marginBottom: 10 }}>Strengths</h3>
              <ul className="verdict-list pros">
                {positive.map((p) => <li key={p}>{p}</li>)}
                {positive.length === 0 && <li style={{ color: "var(--text-tertiary)" }}>Insufficient data for assessment</li>}
              </ul>
            </div>
            <div>
              <h3 style={{ color: "var(--score-mid)", fontSize: "0.9rem", marginBottom: 10 }}>Trade-offs</h3>
              <ul className="verdict-list cons">
                {drawbacks.map((c) => <li key={c}>{c}</li>)}
                {drawbacks.length === 0 && <li style={{ color: "var(--text-tertiary)" }}>No major trade-offs flagged</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Score Breakdown ───────────────────────── */}
      <ScoreBreakdown
        title="Score Breakdown"
        scores={{
          overall: data.overall_score,
          tactical: data.tactical_score,
          edc: data.edc_score,
          value: data.value_score,
          throw: data.throw_score,
          flood: data.flood_score,
        }}
        breakdown={data.metric_breakdown}
      />

      {/* ── Specs Grid ────────────────────────────── */}
      <div className="grid grid-3">
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Performance</h3>
          <div className="score-stack">
            <div><span className="muted">Max Lumens</span><strong>{fmt(data.max_lumens)}</strong></div>
            <div><span className="muted">Sustained Lumens</span><strong>{fmt(data.sustained_lumens)}</strong></div>
            <div><span className="muted">Candela</span><strong>{fmt(data.max_candela)}</strong></div>
            <div><span className="muted">Beam Distance</span><strong>{fmt(data.beam_distance_m)} m</strong></div>
            <div><span className="muted">Beam Pattern</span><strong>{data.beam_pattern || "—"}</strong></div>
            <div><span className="muted">CRI</span><strong>{fmt(data.cri)}</strong></div>
            <div><span className="muted">Turbo Stepdown</span><strong>{fmt(data.turbo_stepdown_sec)}s</strong></div>
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Hardware</h3>
          <div className="score-stack">
            <div><span className="muted">Battery</span><strong>{data.battery_types?.length ? data.battery_types.join(", ") : "—"}</strong></div>
            <div><span className="muted">Recharge</span><strong>{data.recharge_type || (data.usb_c_rechargeable ? "USB-C" : "—")}</strong></div>
            <div><span className="muted">Replaceable</span><strong>{yesNo(data.battery_replaceable)}</strong></div>
            <div><span className="muted">LED</span><strong>{data.led_model || "—"}</strong></div>
            <div><span className="muted">Weight</span><strong>{fmt(data.weight_g, 1)}g</strong></div>
            <div><span className="muted">Length</span><strong>{fmt(data.length_mm, 1)}mm</strong></div>
            <div><span className="muted">Head</span><strong>{fmt(data.head_diameter_mm, 1)}mm</strong></div>
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Features</h3>
          <div className="score-stack">
            <div><span className="muted">IP Rating</span><strong>{data.waterproof_rating || "—"}</strong></div>
            <div><span className="muted">Impact Resist.</span><strong>{fmt(data.impact_resistance_m, 1)}m</strong></div>
            <div><span className="muted">Material</span><strong>{data.body_material || "—"}</strong></div>
            <div><span className="muted">Strobe</span><strong>{yesNo(data.has_strobe)}</strong></div>
            <div><span className="muted">Lockout</span><strong>{yesNo(data.has_lockout)}</strong></div>
            <div><span className="muted">Memory</span><strong>{yesNo(data.has_memory_mode)}</strong></div>
            <div><span className="muted">Magnetic Tail</span><strong>{yesNo(data.has_magnetic_tailcap)}</strong></div>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ─────────────────────────────── */}
      <div className="panel" style={{ textAlign: "center", padding: "28px 20px" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>
          Ready to buy the {data.brand} {data.name}?
        </p>
        {data.price_usd !== undefined && data.price_usd > 0 && (
          <p style={{ fontSize: "1.3rem", fontWeight: 700, color: "#22c55e", marginBottom: 12 }}>
            ${fmt(data.price_usd, 2)}
          </p>
        )}
        <BuyOnAmazonButton amazon_url={data.amazon_url} price_usd={data.price_usd} size="lg" />
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
          As an Amazon Associate we earn from qualifying purchases.
        </p>
      </div>

      {/* ── Mode Table ────────────────────────────── */}
      {data.modes && data.modes.length > 0 && (
        <div className="panel">
          <h2 style={{ marginBottom: 16 }}>Output Modes</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Output (lm)</th>
                  <th>Runtime (min)</th>
                  <th>Candela</th>
                  <th>Throw (m)</th>
                </tr>
              </thead>
              <tbody>
                {data.modes.map((mode) => (
                  <tr key={mode.name}>
                    <td style={{ fontWeight: 600 }}>{mode.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{fmt(mode.output_lumens)}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{fmt(mode.runtime_min)}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{fmt(mode.candela)}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{fmt(mode.beam_distance_m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FAQ ───────────────────────────────────── */}
      {faqItems.length > 0 && (
        <div className="panel">
          <h2 style={{ marginBottom: 16 }}>Common Questions</h2>
          <FAQ items={faqItems} />
        </div>
      )}

      {/* ── Alternatives ──────────────────────────── */}
      {alternatives.length > 0 && (
        <div className="panel">
          <div className="section-header">
            <h2>Similar Flashlights</h2>
            <Link href={`/best-flashlights/${BEST_FOR_SLUG[bestFor] || "tactical"}`}>Browse {bestFor} →</Link>
          </div>
          <p className="muted" style={{ marginBottom: 16, fontSize: "0.9rem" }}>
            Other models in a similar price range you should consider.
          </p>
          <div className="card-grid">
            {alternatives.map((alt) => (
              <FlashlightCard key={alt.id} item={alt} />
            ))}
          </div>
        </div>
      )}

      <AmazonDisclosure />
    </section>
  );
}
