import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchFlashlights } from "@/lib/api";

export const metadata: Metadata = {
  title: "Best Flashlights Under $50 in 2026 — Top Budget Picks Ranked",
  description:
    "The best flashlights under $50 ranked by our algorithm. Quality LED flashlights with USB-C charging, high lumens, and waterproofing — without breaking the bank.",
  alternates: { canonical: "/best-flashlights/under-50" },
};

export default async function Under50Page() {
  const data = await fetchFlashlights({ maxPrice: 50, sortBy: "value_score", order: "desc" });

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Best Flashlights", href: "/best-flashlights" },
          { name: "Under $50" },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Best Flashlights", href: "/best-flashlights" },
          { label: "Under $50" },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Budget Picks</p>
        <h1>Best Flashlights Under $50</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          You do not need to spend $100+ to get a reliable, high-performance
          flashlight. These are our top-scoring models under $50 — ranked by
          value score, which balances raw performance against price.
        </p>
      </div>

      <div className="card-grid">
        {data.items.map((item, i) => (
          <FlashlightCard key={item.id} item={item} rank={i + 1} />
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No flashlights under $50 in the catalog right now.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>What to Expect Under $50</h2>
        <p className="muted" style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>
          In the sub-$50 range, you can expect 1,000–2,000 lumens, USB-C
          rechargeable 18650 battery, IPX8 waterproofing, and 2–4 hour medium-mode
          runtime. Brands like Wurkkos, Sofirn, and Skilhunt dominate this price
          tier with enthusiast-grade specs at a fraction of premium brand pricing.
          The main trade-offs are simpler UIs, less refined build quality, and
          fewer accessory ecosystems compared to $100+ lights.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Shop by Budget</h3>
        <div className="spec-row">
          <Link href="/best-flashlights/under-100" className="chip">Under $100</Link>
          <Link href="/best-flashlights/value" className="chip">Best Value</Link>
          <Link href="/best-flashlights/edc" className="chip">Best EDC</Link>
          <Link href="/best-flashlights" className="chip">All Categories</Link>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
