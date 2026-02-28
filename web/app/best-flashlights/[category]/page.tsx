import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchRankings } from "@/lib/api";

type CategoryConfig = {
  label: string;
  rankingKey: string;
  h1: string;
  description: string;
  guide: {
    title: string;
    content: string;
  };
};

const categoryMap: Record<string, CategoryConfig> = {
  tactical: {
    label: "Tactical",
    rankingKey: "tactical",
    h1: "Best Tactical Flashlights",
    description:
      "Top tactical flashlights ranked by candela, runtime, durability, and throw. Optimized for law enforcement, defense, and duty use.",
    guide: {
      title: "What Makes a Great Tactical Flashlight?",
      content:
        "A tactical flashlight needs to be reliable under pressure. Key factors include high candela for blinding output, long runtime on high mode, impact resistance rating (1m+), and waterproofing (IPX8 minimum). Most tactical lights use 18650 or 21700 cells for sustained power, and feature tail-switch activation for one-handed momentary-on. Our tactical score weights candela (30%), runtime (20%), durability (20%), throw distance (20%), and price (10%)."
    }
  },
  edc: {
    label: "EDC",
    rankingKey: "edc",
    h1: "Best EDC Flashlights",
    description:
      "Top everyday carry flashlights ranked by runtime, portability, price, and durability. Pocket-sized lights for daily use.",
    guide: {
      title: "Choosing the Right EDC Flashlight",
      content:
        "The best EDC flashlight disappears in your pocket until you need it. Look for a weight under 100g, a length under 120mm, and solid medium-mode runtime (4+ hours). USB-C charging is nearly essential for daily use. A good moonlight mode (sub-1 lumen) preserves night vision and extends battery life. Our EDC score weights runtime (30%), flood coverage (20%), price (20%), durability (15%), and lumens (15%)."
    }
  },
  camping: {
    label: "Camping",
    rankingKey: "flood",
    h1: "Best Flashlights for Camping",
    description:
      "Top camping flashlights ranked by flood output, runtime, and value. Bright, long-lasting illumination for the outdoors.",
    guide: {
      title: "Picking a Camping Flashlight",
      content:
        "Camping flashlights prioritize long runtime and wide, even illumination over raw throw distance. Look for models with 4+ hour medium-mode runtime, good flood beam patterns, and at least IPX4 water resistance. Magnetic tailcaps are useful for hands-free use in tents. Our flood score — which powers this category — weights lumens (50%), runtime (25%), price (15%), and durability (10%)."
    }
  },
  "search-rescue": {
    label: "Search & Rescue",
    rankingKey: "throw",
    h1: "Best Flashlights for Search & Rescue",
    description:
      "Top search and rescue flashlights ranked by beam distance, candela, and runtime. Maximum visibility for critical operations.",
    guide: {
      title: "Search & Rescue Flashlight Requirements",
      content:
        "SAR flashlights demand maximum reach. Look for 300m+ beam distance, 40,000+ candela, and sustained high-mode runtime of 2+ hours. Waterproofing (IP68) is essential for field conditions. Larger head diameters generally produce tighter, farther-reaching beams. Our throw score — which drives this category — weights candela (45%), beam distance (30%), runtime (15%), and durability (10%)."
    }
  },
  value: {
    label: "Best Value",
    rankingKey: "value",
    h1: "Best Value Flashlights",
    description:
      "Top flashlights ranked by performance-per-dollar. The most capability for the lowest price.",
    guide: {
      title: "Getting the Most for Your Money",
      content:
        "Value doesn't mean cheap — it means maximum capability per dollar spent. Our value score combines performance metrics (lumens, candela, runtime, durability) at 60% weight with price efficiency at 40%. The best value picks often come from brands like Wurkkos, Sofirn, and Convoy, which offer enthusiast-grade specs at fraction of the big-brand pricing."
    }
  },
  throw: {
    label: "Max Throw",
    rankingKey: "throw",
    h1: "Best Throw Flashlights",
    description:
      "Flashlights with the farthest beam distance, ranked by candela and throw performance.",
    guide: {
      title: "Understanding Flashlight Throw",
      content:
        "Throw is measured by ANSI FL1 beam distance — the point where intensity falls to 0.25 lux. It's determined primarily by candela (focused intensity), not lumens (total output). A light with 50,000 candela will out-throw one with 5,000 lumens but only 10,000 candela. Larger reflectors and TIR optics produce tighter beams for greater throw. Our throw score weights candela (45%), beam distance (30%), runtime (15%), and durability (10%)."
    }
  },
  flood: {
    label: "Max Flood",
    rankingKey: "flood",
    h1: "Best Flood Flashlights",
    description:
      "Flashlights with the brightest, widest beams, ranked by lumen output and coverage.",
    guide: {
      title: "Understanding Flashlight Flood",
      content:
        "Flood refers to wide, even light distribution — ideal for lighting up rooms, campsites, or work areas. High-lumen flashlights with wide beam angles or TIR optics designed for flood produce the most usable light at close to medium range. Multi-emitter designs often excel here. Our flood score weights lumens (50%), runtime (25%), price (15%), and durability (10%)."
    }
  }
};

export function generateStaticParams() {
  return Object.keys(categoryMap).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const config = categoryMap[params.category];
  if (!config) {
    return { title: "Category Not Found" };
  }
  return {
    title: `${config.h1} 2026 — Ranked by Expert Score`,
    description: config.description,
    alternates: { canonical: `/best-flashlights/${params.category}` }
  };
}

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const config = categoryMap[params.category];

  if (!config) {
    return (
      <section className="grid">
        <div className="panel hero">
          <h1>Category Not Found</h1>
          <p className="muted">
            This category doesn&apos;t exist. <Link href="/best-flashlights">Browse all categories.</Link>
          </p>
        </div>
      </section>
    );
  }

  const data = await fetchRankings(config.rankingKey, 200);

  return (
    <section className="grid">
      <BreadcrumbStructuredData items={[{ name: "Best Flashlights", href: "/best-flashlights" }, { name: config.label }]} />
      <Breadcrumbs items={[{ label: "Best Flashlights", href: "/best-flashlights" }, { label: config.label }]} />

      <div className="panel hero">
        <p className="kicker">{config.label} Category</p>
        <h1>{config.h1}</h1>
        <p className="muted" style={{ maxWidth: 620 }}>{config.description}</p>
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
              tactical_score: item.profile === "tactical" ? item.score : undefined,
              edc_score: item.profile === "edc" ? item.score : undefined,
              value_score: item.profile === "value" ? item.score : undefined,
              throw_score: item.profile === "throw" ? item.score : undefined,
              flood_score: item.profile === "flood" ? item.score : undefined
            }}
          />
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No ranked flashlights in this category yet. Run the scoring job to populate rankings.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>{config.guide.title}</h2>
        <p className="muted" style={{ lineHeight: 1.7, fontSize: "0.95rem" }}>
          {config.guide.content}
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Explore Other Categories</h3>
        <div className="spec-row">
          {Object.entries(categoryMap)
            .filter(([slug]) => slug !== params.category)
            .map(([slug, cat]) => (
              <Link key={slug} href={`/best-flashlights/${slug}`} className="chip">
                {cat.label}
              </Link>
            ))}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
