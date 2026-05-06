import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { CompareCardView } from "@/components/CompareCardView";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import {
  fetchFlashlightByID,
  fetchFlashlightBySlug,
  fetchAllSlugs,
  type FlashlightDetail,
} from "@/lib/api";

export const revalidate = 3600;

// Pre-render the top 30 x 30 = 435 vs-pages at build time using slug URLs.
// Matches the sitemap so Google can crawl them straight from a static cache.
// Pairs beyond the top-30 still resolve on demand via ISR.
export async function generateStaticParams() {
  try {
    const slugs = await fetchAllSlugs();
    const top = slugs.filter((s) => s.slug).slice(0, 30);
    const params: Record<string, string>[] = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        // Folder is `[a]-vs-[b]` which Next 14 collapses into a single
        // segment captured under whichever key matches first. We provide
        // both a/b and the collapsed shape so Next can pick the right one.
        params.push({ a: top[i].slug, b: top[j].slug });
      }
    }
    return params;
  } catch {
    return [];
  }
}

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
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

// Next.js 14 collapses the folder name `[a]-vs-[b]` into a single dynamic
// segment (key like `a]-vs-[b`) instead of two captures. We extract the
// halves from whichever shape we get to stay compatible.
type Params = Record<string, string>;

function extractHalves(params: Params): { a: string; b: string } | null {
  if (params["a"] && params["b"]) {
    return { a: params["a"], b: params["b"] };
  }
  for (const value of Object.values(params)) {
    if (typeof value === "string" && value.includes("-vs-")) {
      // Slugs themselves can contain hyphens (e.g. "fenix-pd36r"). The split
      // separator is the literal "-vs-". Use the FIRST occurrence so a slug
      // like "fenix-vs-something-vs-other" picks "fenix" / "something-vs-other"
      // — but in practice no real slug contains "-vs-" so this is safe.
      const idx = value.indexOf("-vs-");
      const a = value.slice(0, idx);
      const b = value.slice(idx + "-vs-".length);
      if (a && b) return { a, b };
    }
  }
  return null;
}

// resolveOne accepts either a numeric ID ("24") or a slug ("acebeam-e75")
// and returns the FlashlightDetail. Numeric strings hit the by-ID endpoint
// for back-compat with old /compare/24-vs-37 URLs; slug strings hit the
// by-slug helper, which is the canonical form going forward.
function isNumericID(s: string): boolean {
  return /^\d+$/.test(s);
}

async function resolveOne(handle: string): Promise<FlashlightDetail> {
  if (isNumericID(handle)) {
    return fetchFlashlightByID(handle);
  }
  return fetchFlashlightBySlug(handle);
}

async function loadPair(params: Params) {
  const halves = extractHalves(params);
  if (!halves) return null;

  try {
    const [a, b] = await Promise.all([
      resolveOne(halves.a),
      resolveOne(halves.b),
    ]);
    // Canonical URL always uses slugs. If we resolved by ID, fall back to
    // the resolved slug so old /compare/24-vs-37 links still emit a slug
    // canonical (and signal Google to consolidate ranking on the slug URL).
    const canonicalA = a.slug || halves.a;
    const canonicalB = b.slug || halves.b;
    return { a, b, halves, canonicalA, canonicalB };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const pair = await loadPair(params);
  if (!pair) return { title: "Comparison Not Found" };
  const { a, b, canonicalA, canonicalB } = pair;
  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;
  return {
    title: `${nameA} vs ${nameB} — Side by Side Comparison 2026`,
    description: `Compare the ${nameA} (${fmt(a.max_lumens)} lm, ${fmt(a.beam_distance_m)}m throw) against the ${nameB} (${fmt(b.max_lumens)} lm, ${fmt(b.beam_distance_m)}m throw). Specs, scores, and pricing compared.`,
    alternates: { canonical: `/compare/${canonicalA}-vs-${canonicalB}` },
    openGraph: {
      title: `${nameA} vs ${nameB} — Which Is Better?`,
      description: `Head-to-head comparison of specs, scores, and value.`,
    },
  };
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

  return (
    <section className="grid compare-detail-section">
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
          Side-by-side specs, scores, and Amazon pricing. Winner badges show which model leads each profile;
          expand the full spec comparison for the deep dive.
        </p>
      </div>

      <CompareCardView items={[a, b]} showFullSpecsToggle />

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>Our Verdict</h2>
        <p style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>{verdictText(a, b)}</p>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Explore More</h3>
        <div className="spec-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Link
            href={a.slug ? `/reviews/${a.slug}` : `/flashlights/${a.id}`}
            className="chip"
          >
            {nameA} Details
          </Link>
          <Link
            href={b.slug ? `/reviews/${b.slug}` : `/flashlights/${b.id}`}
            className="chip"
          >
            {nameB} Details
          </Link>
          <Link href="/best-flashlights/tactical" className="chip">Best Tactical</Link>
          <Link href="/best-flashlights/edc" className="chip">Best EDC</Link>
          <Link href="/best-flashlights/value" className="chip">Best Value</Link>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
