import type { Metadata } from "next";
import Link from "next/link";
import { FlashlightCard } from "@/components/FlashlightCard";
import { FAQ } from "@/components/FAQ";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights, fetchRankings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Best Flashlights 2026 — Data-Driven Rankings & Reviews | FlashlightRatings",
  description: "Compare 40+ flashlights ranked by algorithm across tactical, EDC, camping & more. Real specs, independent scoring, and live Amazon pricing. Find the perfect flashlight in minutes.",
  alternates: { canonical: "/" }
};

const useCases = [
  { label: "Tactical", href: "/best-flashlights/tactical", icon: "⚔" },
  { label: "EDC", href: "/best-flashlights/edc", icon: "🔑" },
  { label: "Camping", href: "/best-flashlights/camping", icon: "⛺" },
  { label: "Search & Rescue", href: "/best-flashlights/search-rescue", icon: "🔦" },
  { label: "Best Value", href: "/best-flashlights/value", icon: "💰" },
  { label: "Max Throw", href: "/best-flashlights/throw", icon: "🎯" }
];

const quickFilters = [
  { label: "All", href: "/flashlights" },
  { label: "EDC", href: "/flashlights?use_case=edc" },
  { label: "Tactical", href: "/flashlights?use_case=tactical" },
  { label: "Camping", href: "/flashlights?use_case=camping" },
  { label: "Search & Rescue", href: "/flashlights?use_case=search-rescue" },
  { label: "Under $50", href: "/flashlights?max_price=50" },
  { label: "Under $100", href: "/flashlights?max_price=100" },
];

const methodology = [
  { name: "Tactical", weights: "Candela 30% · Runtime 20% · Durability 20% · Throw 20% · Price 10%" },
  { name: "EDC", weights: "Runtime 30% · Flood 20% · Price 20% · Durability 15% · Lumens 15%" },
  { name: "Value", weights: "Performance 60% · Price 40%" },
  { name: "Throw", weights: "Candela 45% · Beam Distance 30% · Runtime 15% · Durability 10%" },
  { name: "Flood", weights: "Lumens 50% · Runtime 25% · Price 15% · Durability 10%" }
];

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

export default async function HomePage() {
  const [rankings, flashlights] = await Promise.all([
    fetchRankings("tactical"),
    fetchFlashlights()
  ]);

  const topRanked = rankings.items.slice(0, 3);
  const featured = flashlights.items.slice(0, 8);

  const catalogSize = flashlights.total;
  const topScore = topRanked[0]?.score;
  const prices = flashlights.items.map((x) => x.price_usd).filter((p): p is number => p !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  const compareIds = topRanked.map((r) => r.flashlight.id).join(",");

  return (
    <section className="grid">

      {/* ── Hero ──────────────────────────────────── */}
      <div className="panel hero" style={{ textAlign: "center", padding: "48px 24px" }}>
        <p className="kicker" style={{ marginBottom: 8 }}>Independent, Algorithm-Powered Reviews</p>
        <h1 style={{ fontSize: "2.25rem", maxWidth: 700, margin: "0 auto 12px" }}>
          Best Flashlights of 2026, Ranked by Data
        </h1>
        <p className="muted" style={{ maxWidth: 600, margin: "0 auto 24px", fontSize: "1.05rem" }}>
          {catalogSize} flashlights scored across tactical, EDC, camping, throw, and value profiles.
          Verified manufacturer specs, algorithmic rankings, and live Amazon pricing — no sponsored placements.
        </p>
        <div className="cta-row" style={{ justifyContent: "center" }}>
          <Link href="/find-yours" className="button-link">
            Find Your Flashlight
          </Link>
          <Link href="/compare" className="button-link button-secondary">
            Compare & Rankings
          </Link>
        </div>
      </div>

      {/* ── Use Case Grid ─────────────────────────── */}
      <div className="use-case-grid">
        {useCases.map((uc) => (
          <Link key={uc.label} href={uc.href} className="use-case-card">
            <span className="use-case-icon">{uc.icon}</span>
            <span>{uc.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Stats ─────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card">
          <p className="kicker">Catalog</p>
          <p className="stat-value">{catalogSize}</p>
          <p className="stat-label">models indexed</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Top Score</p>
          <p className="stat-value">{topScore ? topScore.toFixed(1) : "—"}</p>
          <p className="stat-label">tactical leader</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Starting At</p>
          <p className="stat-value">${minPrice.toFixed(0)}</p>
          <p className="stat-label">lowest in catalog</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Scoring</p>
          <p className="stat-value">5</p>
          <p className="stat-label">ranking dimensions</p>
        </div>
      </div>

      {/* ── Top Ranked ────────────────────────────── */}
      <div className="panel">
        <div className="section-header">
          <h2>Top Ranked Tactical</h2>
          <Link href="/best-flashlights/tactical">View all →</Link>
        </div>
        <p className="muted" style={{ marginBottom: 16, fontSize: "0.9rem" }}>
          Highest-scoring flashlights in our tactical category right now.
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
        {compareIds && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link href={`/compare?ids=${compareIds}`} className="btn btn-ghost">
              Compare Top 3 Side by Side →
            </Link>
          </div>
        )}
      </div>

      {/* ── Featured Models ───────────────────────── */}
      <div className="panel">
        <div className="section-header">
          <h2>Browse the Catalog</h2>
          <Link href="/flashlights">See all models →</Link>
        </div>
        <p className="muted" style={{ marginBottom: 12, fontSize: "0.9rem" }}>
          Specs, scores, and prices for every flashlight we track.
        </p>
        <div className="filters" style={{ marginBottom: 16 }}>
          {quickFilters.map((qf) => (
            <Link key={qf.label} href={qf.href} className="chip">
              {qf.label}
            </Link>
          ))}
        </div>
        <div className="card-grid">
          {featured.map((item) => (
            <FlashlightCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* ── How We Score ──────────────────────────── */}
      <div className="panel">
        <div className="section-header">
          <h2>How We Score</h2>
          <Link href="/guides/how-we-score">Full methodology →</Link>
        </div>
        <p className="muted" style={{ marginBottom: 16, fontSize: "0.9rem" }}>
          Every flashlight is evaluated across 5 weighted scoring profiles using verified manufacturer specs.
        </p>
        <div className="method-grid">
          {methodology.map((m) => (
            <div key={m.name} className="method-card">
              <h4>{m.name}</h4>
              <p>{m.weights}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────── */}
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Frequently Asked Questions</h2>
        <FAQ items={faq} />
      </div>

      <AmazonDisclosure />
    </section>
  );
}
