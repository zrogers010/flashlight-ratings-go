import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchFlashlights } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Best Flashlights Under $100 in 2026 — Mid-Range Picks Ranked",
  description:
    "The best flashlights under $100 ranked by algorithm. Premium features like USB-C, high CRI, and 2000+ lumens at mid-range prices.",
  alternates: { canonical: "/best-flashlights/under-100" },
};

export default async function Under100Page() {
  const data = await fetchFlashlights({ maxPrice: 100, sortBy: "value_score", order: "desc" });

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Best Flashlights", href: "/best-flashlights" },
          { name: "Under $100" },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Best Flashlights", href: "/best-flashlights" },
          { label: "Under $100" },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Mid-Range Picks</p>
        <h1>Best Flashlights Under $100</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          The sweet spot for most buyers. Under $100, you get premium build
          quality, advanced features, and top-tier performance — without paying
          the premium-brand tax. These are ranked by value score.
        </p>
      </div>

      <div className="card-grid">
        {data.items.map((item, i) => (
          <FlashlightCard key={item.id} item={item} rank={i + 1} />
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No flashlights under $100 in the catalog right now.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>What $50–$100 Gets You</h2>
        <p className="muted" style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>
          In the $50–$100 range, you unlock premium features: Nichia or Samsung
          high-CRI emitters, Anduril firmware with fully programmable UI,
          21700 batteries for longer runtime, titanium or copper body options,
          and aux LEDs. This is where enthusiast-grade brands like Emisar,
          Hank lights, and premium Wurkkos models live. You also start seeing
          lights from established brands like Fenix, Streamlight, and Armytek
          at their entry-level price points.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Shop by Budget</h3>
        <div className="spec-row">
          <Link href="/best-flashlights/under-50" className="chip">Under $50</Link>
          <Link href="/best-flashlights/value" className="chip">Best Value</Link>
          <Link href="/best-flashlights/tactical" className="chip">Tactical</Link>
          <Link href="/best-flashlights" className="chip">All Categories</Link>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
