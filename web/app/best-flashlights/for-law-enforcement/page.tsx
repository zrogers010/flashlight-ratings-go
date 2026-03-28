import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchRankings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Best Flashlights for Law Enforcement 2026 — Duty-Ready Picks",
  description:
    "Top flashlights for law enforcement and duty use in 2026. High-candela tactical lights ranked by real-world performance: reliability, throw, runtime, and waterproofing.",
  alternates: { canonical: "/best-flashlights/for-law-enforcement" },
};

export default async function LawEnforcementPage() {
  const data = await fetchRankings("tactical", 200);

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Best Flashlights", href: "/best-flashlights" },
          { name: "For Law Enforcement" },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Best Flashlights", href: "/best-flashlights" },
          { label: "For Law Enforcement" },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Duty-Ready</p>
        <h1>Best Flashlights for Law Enforcement</h1>
        <p className="muted" style={{ maxWidth: 660 }}>
          When reliability matters most. These flashlights are ranked by our
          tactical scoring algorithm — weighting candela, runtime, durability,
          throw distance, and price — the factors that matter on duty.
        </p>
      </div>

      <div className="card-grid">
        {data.items.map((item) => (
          <FlashlightCard
            key={item.flashlight.id}
            rank={item.rank}
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
              tactical_score: item.score,
            }}
          />
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No ranked flashlights available yet.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>What Law Enforcement Needs in a Flashlight</h2>
        <p className="muted" style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>
          Duty flashlights face unique demands. Officers need a light that
          activates instantly (tail-switch momentary-on), produces enough
          candela to temporarily disorient a threat (60,000+ cd ideal), runs
          reliably through a full shift (2+ hours on high), and survives drops
          onto concrete (1.5m+ impact rating). IPX8 waterproofing is standard
          for all-weather use. Most duty lights use 18650 or CR123A cells —
          18650 rechargeables are more economical, while CR123A primaries have
          a 10-year shelf life for vehicle kits. Brands like SureFire,
          Streamlight, Cloud Defensive, and Modlite are the most common on
          duty belts, but value-oriented options from Fenix and Acebeam offer
          comparable performance at lower price points.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Related Categories</h3>
        <div className="spec-row">
          <Link href="/best-flashlights/tactical" className="chip">Tactical</Link>
          <Link href="/best-flashlights/search-rescue" className="chip">Search &amp; Rescue</Link>
          <Link href="/best-flashlights/under-100" className="chip">Under $100</Link>
          <Link href="/best-flashlights" className="chip">All Categories</Link>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
