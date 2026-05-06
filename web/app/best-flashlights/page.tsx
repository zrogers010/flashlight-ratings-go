import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights, fetchBrands } from "@/lib/api";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Best Flashlights 2026 — Expert-Ranked by Category",
  description:
    "Browse the best flashlights ranked across tactical, EDC, camping, search & rescue, value, and throw categories. Data-driven scores based on verified specs.",
  alternates: { canonical: "/best-flashlights" }
};

const categories = [
  {
    slug: "edc",
    label: "Best Everyday Carry",
    icon: "\uD83D\uDD11",
    desc: "Compact, reliable, and pocket-friendly for daily use."
  },
  {
    slug: "tactical",
    label: "Best Tactical",
    icon: "\u2694",
    desc: "High candela, durable, and duty-ready for defense and security."
  },
  {
    slug: "camping",
    label: "Best for Camping & Outdoors",
    icon: "\u26FA",
    desc: "Long runtime, wide beam, and weather-resistant for the outdoors."
  },
  {
    slug: "search-rescue",
    label: "Best for Search & Rescue",
    icon: "\uD83D\uDD26",
    desc: "Maximum throw and runtime for critical field operations."
  },
  {
    slug: "survival",
    label: "Best for Survival",
    icon: "\uD83D\uDD25",
    desc: "Bomb-proof reliability and rugged durability for emergency situations."
  },
  {
    slug: "diving",
    label: "Best for Diving & Maritime",
    icon: "\uD83E\uDD3F",
    desc: "Submersible lights rated for deep underwater use."
  },
  {
    slug: "value",
    label: "Best Value",
    icon: "\uD83D\uDCB0",
    desc: "Maximum performance per dollar — the smartest buys in our catalog."
  },
  {
    slug: "throw",
    label: "Best Throwers",
    icon: "\uD83C\uDFAF",
    desc: "Maximum beam distance and candela for long-range spotting."
  },
  {
    slug: "flood",
    label: "Best Flood",
    icon: "\uD83D\uDCA1",
    desc: "Maximum lumen output for wide, bright area illumination."
  }
];

export default async function BestFlashlightsPage({
  searchParams,
}: {
  searchParams?: { brand?: string };
}) {
  const sp = searchParams || {};
  const selectedBrand = sp.brand || "";

  const [data, brands] = await Promise.all([
    fetchFlashlights({ brand: selectedBrand || undefined }),
    fetchBrands(),
  ]);

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Best Flashlights" }]} />

      <div className="panel hero">
        <p className="kicker">Expert-Ranked Categories</p>
        <h1>Best Flashlights by Category</h1>
        <p className="muted" style={{ maxWidth: 580 }}>
          Every flashlight in our catalog is scored across 5 dimensions.
          Choose a category to see the top-ranked models for your use case.
        </p>
      </div>

      <div className="guide-grid">
        {categories.map((cat) => (
          <Link key={cat.slug} href={`/best-flashlights/${cat.slug}`} className="guide-card" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.5rem" }}>{cat.icon}</span>
            <h3>{cat.label}</h3>
            <p className="muted" style={{ fontSize: "0.88rem" }}>{cat.desc}</p>
          </Link>
        ))}
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>All Flashlights</h2>
          <span className="badge">{data.total} models</span>
        </div>
        <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
          Full catalog with specs, scores, and current Amazon pricing.
          {selectedBrand && <> Showing <strong>{selectedBrand}</strong> only.</>}
        </p>

        <div className="filters" style={{ marginBottom: 20 }}>
          <Link
            href="/best-flashlights"
            className={selectedBrand === "" ? "active" : ""}
          >
            All Brands
          </Link>
          {brands.map((brand) => (
            <Link
              key={brand}
              href={`/best-flashlights?brand=${encodeURIComponent(brand)}`}
              className={selectedBrand.toLowerCase() === brand.toLowerCase() ? "active" : ""}
            >
              {brand}
            </Link>
          ))}
        </div>

        <div className="card-grid">
          {data.items.map((item) => (
            <FlashlightCard key={item.id} item={item} />
          ))}
          {data.items.length === 0 && (
            <p className="muted">No flashlights found for this brand.</p>
          )}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
