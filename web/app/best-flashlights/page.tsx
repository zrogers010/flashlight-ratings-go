import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights } from "@/lib/api";

export const metadata: Metadata = {
  title: "Best Flashlights 2026 — Expert-Ranked by Category",
  description:
    "Browse the best flashlights ranked across tactical, EDC, camping, search & rescue, value, and throw categories. Data-driven scores based on verified specs."
};

const categories = [
  {
    slug: "tactical",
    label: "Best Tactical",
    icon: "⚔",
    desc: "High candela, durable, and duty-ready for law enforcement and defense."
  },
  {
    slug: "edc",
    label: "Best EDC",
    icon: "🔑",
    desc: "Compact, reliable, and pocket-friendly for everyday carry."
  },
  {
    slug: "camping",
    label: "Best for Camping",
    icon: "⛺",
    desc: "Long runtime, wide beam, and weather-resistant for the outdoors."
  },
  {
    slug: "value",
    label: "Best Value",
    icon: "💰",
    desc: "Maximum performance per dollar — the smartest buys in our catalog."
  },
  {
    slug: "throw",
    label: "Best Throwers",
    icon: "🎯",
    desc: "Maximum beam distance and candela for long-range spotting."
  },
  {
    slug: "flood",
    label: "Best Flood",
    icon: "💡",
    desc: "Maximum lumen output for wide, bright area illumination."
  }
];

export default async function BestFlashlightsPage() {
  const data = await fetchFlashlights();

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
        </p>
        <div className="card-grid">
          {data.items.map((item) => (
            <FlashlightCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
