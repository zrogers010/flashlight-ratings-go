import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { FlashlightCard } from "@/components/FlashlightCard";
import { FAQ } from "@/components/FAQ";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights, fetchRankings } from "@/lib/api";
import type { FlashlightItem } from "@/lib/api";

export const metadata: Metadata = {
  title: "Gear Discovery Dashboard — Flashlight Specs & Rankings | FlashlightRatings",
  description:
    "Data-dense flashlight catalog: filter by use case, compare verified specs, and browse algorithmic tactical rankings with live Amazon pricing.",
  alternates: { canonical: "/" }
};

const faq = [
  {
    q: "How are flashlights ranked?",
    a: "Every flashlight is scored across 5 dimensions (Tactical, EDC, Value, Throw, Flood) using a weighted algorithm that factors in candela, lumens, runtime, durability, and price. Scores are normalized on a 0-100 scale."
  },
  {
    q: "How often are rankings and prices updated?",
    a: "Our sync worker pulls fresh data from the Amazon Product Advertising API on a regular schedule. Scores are recalculated with each sync. Prices may lag live Amazon listings by a few hours."
  },
  {
    q: "Are these affiliate links?",
    a: "Yes. As an Amazon Associate we earn from qualifying purchases. This supports the site at no extra cost to you. We rank by algorithm, not commission — every recommendation is data-driven."
  },
  {
    q: "Can I compare flashlights side by side?",
    a: "Yes! Use our Compare tool to view specs, scores, and prices for up to 20 flashlights in a side-by-side table. Or use Find Yours to get personalized recommendations based on your use case and budget."
  }
];

function countTagged(items: FlashlightItem[], slug: string): number {
  return items.reduce((n, f) => n + (f.use_case_tags?.includes(slug) ? 1 : 0), 0);
}

function IconCrosshair() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
    </svg>
  );
}

function IconPocketKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 14V9a4 4 0 0 1 8 0v5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8 14h6l2 2v3H8v-5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconTent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M6 20L12 5l6 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M9 20l3-6 3 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function IconBeacon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v4M12 17v4M8.5 5.5l2.5 2M13 16.5l2.5 2M5.5 8.5l2 2.5M16.5 13l2 2.5M4 12h4M16 12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconDiveMask() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12c2-3 5-4 8-4s6 1 8 4c-1.5 3.5-4.5 6-8 6s-6.5-2.5-8-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <ellipse cx="9" cy="12" rx="2.2" ry="2" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="15" cy="12" rx="2.2" ry="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 19c1.5-1 3.5-1.5 6-1.5s4.5.5 6 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

function IconFlame() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2c1 4 5 6 5 11a5 5 0 01-10 0c0-5 4-7 5-11z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 22c-1.5 0-2.5-1.5-2.5-3.5 0-2 2.5-3.5 2.5-5 0 1.5 2.5 3 2.5 5s-1 3.5-2.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v18M15 6.5c0-1.5-1-2.5-3-2.5s-3 1.2-3 2.5c0 3 6 2.2 6 5.5 0 1.5-1.2 2.5-3 2.5s-3-1-3-2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DASHBOARD_USE_CASES: {
  slug: string;
  label: string;
  icon: ReactNode;
}[] = [
  { slug: "edc", label: "Everyday Carry", icon: <IconPocketKey /> },
  { slug: "tactical", label: "Tactical", icon: <IconCrosshair /> },
  { slug: "camping", label: "Camping & Outdoors", icon: <IconTent /> },
  { slug: "search-rescue", label: "Search & Rescue", icon: <IconBeacon /> },
  { slug: "survival", label: "Survival", icon: <IconFlame /> },
  { slug: "diving", label: "Diving & Maritime", icon: <IconDiveMask /> },
  { slug: "weapon-mount", label: "Weapon Mount", icon: <IconTarget /> },
  { slug: "value", label: "Best Value", icon: <IconDollar /> }
];

export default async function HomePage() {
  const [rankings, flashlights] = await Promise.all([
    fetchRankings("tactical"),
    fetchFlashlights({ pageSize: 500 })
  ]);

  const topRanked = rankings.items.slice(0, 5);
  const catalogSize = flashlights.total;
  const topScore = topRanked[0]?.score;
  const prices = flashlights.items.map((x) => x.price_usd).filter((p): p is number => p !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  const compareIds = topRanked.map((r) => r.flashlight.id).join(",");

  return (
    <section className="grid">
      <div className="panel hero hero-home hero-dashboard">
        <p className="kicker hero-dashboard-kicker">Gear Discovery Dashboard</p>
        <h1 className="hero-title hero-dashboard-title">Find Your Next Flashlight</h1>
        <p className="muted hero-subtitle hero-dashboard-subtitle">
          Live index: <strong className="hero-dashboard-metric">{catalogSize}</strong> models with normalized scores,
          spec verification, and Amazon price sync.
        </p>
        <div className="cta-row hero-dashboard-cta">
          <Link href="/flashlights" className="button-link">
            Browse All
          </Link>
          <Link href="/find-yours" className="button-link button-secondary">
            Find Yours
          </Link>
        </div>
      </div>

      <div className="panel panel-tight">
        <div className="section-header dashboard-section-head">
          <h2>Browse by Use Case</h2>
        </div>
        <p className="muted dashboard-section-lead">
          Find the right flashlight for your mission. Select a category to filter the catalog.
        </p>
        <div className="dashboard-tiles">
          {DASHBOARD_USE_CASES.map((uc) => {
            const n = countTagged(flashlights.items, uc.slug);
            return (
              <Link key={uc.slug} href={`/flashlights?use_case=${encodeURIComponent(uc.slug)}`} className="tile-card">
                <span className="tile-icon">{uc.icon}</span>
                <span className="tile-label">{uc.label}</span>
                <span className="tile-count">{n} indexed</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="stat-grid stat-grid--metrics">
        <div className="stat-card">
          <p className="kicker">Catalog</p>
          <p className="stat-value">{catalogSize}</p>
          <p className="stat-label">models indexed</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Top Score</p>
          <p className="stat-value">{topScore !== undefined ? topScore.toFixed(1) : "—"}</p>
          <p className="stat-label">tactical leader</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Starting At</p>
          <p className="stat-value">${minPrice.toFixed(0)}</p>
          <p className="stat-label">lowest in catalog</p>
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Top Ranked Tactical</h2>
          <Link href="/best-flashlights/tactical">View all →</Link>
        </div>
        <p className="muted dashboard-section-lead">
          Highest tactical profile scores in the current ranking run.
        </p>
        <div className="card-grid">
          {topRanked.map((item) => (
            <FlashlightCard
              key={item.flashlight.id}
              item={{
                id: item.flashlight.id,
                brand: item.flashlight.brand,
                name: item.flashlight.name,
                slug: item.flashlight.slug,
                image_url: item.flashlight.image_url,
                amazon_url: item.flashlight.amazon_url,
                max_lumens: item.flashlight.max_lumens,
                beam_distance_m: item.flashlight.beam_distance_m,
                waterproof_rating: item.flashlight.waterproof_rating,
                price_usd: item.flashlight.price_usd,
                tactical_score: item.score
              }}
              rank={item.rank}
            />
          ))}
        </div>
        {compareIds ? (
          <div className="dashboard-compare-row">
            <Link href={`/compare?ids=${compareIds}`} className="btn btn-ghost">
              Compare top {topRanked.length} →
            </Link>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Frequently Asked Questions</h2>
        <FAQ items={faq} />
      </div>

      <AmazonDisclosure />
    </section>
  );
}
