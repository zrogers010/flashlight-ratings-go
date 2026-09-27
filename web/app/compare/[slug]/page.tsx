import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { CompareCardView } from "@/components/CompareCardView";
import { PageEventTracker } from "@/components/PageEventTracker";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import {
  fetchFlashlightByID,
  fetchFlashlightBySlug,
  fetchAllSlugs,
  type FlashlightDetail,
} from "@/lib/api";
import { compareUrl } from "@/lib/compare-url";

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const slugs = await fetchAllSlugs();
    const top = slugs.filter((s) => s.slug).slice(0, 30);
    const params: { slug: string }[] = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const [a, b] = [top[i].slug, top[j].slug].sort();
        params.push({ slug: `${a}-vs-${b}` });
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

function parseSlug(slug: string): { a: string; b: string } | null {
  if (!slug.includes("-vs-")) return null;
  const idx = slug.indexOf("-vs-");
  const a = slug.slice(0, idx);
  const b = slug.slice(idx + "-vs-".length);
  if (a && b) return { a, b };
  return null;
}

function isNumericID(s: string): boolean {
  return /^\d+$/.test(s);
}

async function resolveOne(handle: string): Promise<FlashlightDetail> {
  if (isNumericID(handle)) {
    return fetchFlashlightByID(handle);
  }
  return fetchFlashlightBySlug(handle);
}

async function loadPair(slug: string) {
  const halves = parseSlug(slug);
  if (!halves) return null;

  try {
    const [a, b] = await Promise.all([
      resolveOne(halves.a),
      resolveOne(halves.b),
    ]);
    return { a, b, halves };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pair = await loadPair(slug);
  if (!pair) return { title: "Comparison Not Found" };
  const { a, b } = pair;
  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;
  return {
    title: `${nameA} vs ${nameB} — Side by Side Comparison 2026`,
    description: `Compare the ${nameA} (${fmt(a.max_lumens)} lm, ${fmt(a.beam_distance_m)}m throw) against the ${nameB} (${fmt(b.max_lumens)} lm, ${fmt(b.beam_distance_m)}m throw). Specs, scores, and pricing compared.`,
    alternates: { canonical: compareUrl([a, b]) },
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

export default async function VsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pair = await loadPair(slug);
  if (!pair) notFound();
  const { a, b } = pair;

  const nameA = `${a.brand} ${a.name}`;
  const nameB = `${b.brand} ${b.name}`;

  return (
    <section className="grid compare-detail-section">
      <PageEventTracker
        event="compare_view"
        dedupeKey={`${a.slug}-vs-${b.slug}`}
        params={{ pair: `${a.slug}-vs-${b.slug}`, count: 2 }}
      />
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
          Side-by-side specs, scores, and Amazon pricing. Winner badges show which model leads each profile.
          Full spec comparison is included below.
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
