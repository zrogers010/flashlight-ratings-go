import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { BreadcrumbStructuredData, ItemListStructuredData } from "@/components/StructuredData";
import { fetchRankings, fetchFlashlights, fetchBrandsDetailed, type FlashlightItem } from "@/lib/api";
import {
  parseCompositeFilter,
  composeCompositeSlug,
  renderCompositeTitle,
  renderCompositeDescription,
  renderCompositeH1,
  CURATED_COMPOSITE_SEEDS,
  type CompositeFilter,
} from "./composite";

type CategoryConfig = {
  label: string;
  rankingKey: string;
  useCaseFilter?: string;
  sortField?: string;
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
    useCaseFilter: "tactical",
    sortField: "tactical_score",
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
    useCaseFilter: "edc",
    sortField: "edc_score",
    h1: "Best EDC Flashlights",
    description:
      "Top EDC (everyday carry) flashlights ranked by runtime, portability, price, and durability. Pocket-sized lights for daily use.",
    guide: {
      title: "Choosing the Right EDC Flashlight",
      content:
        "The best EDC flashlight disappears in your pocket until you need it. Look for a weight under 100g, a length under 120mm, and solid medium-mode runtime (4+ hours). USB-C charging is nearly essential for daily use. A good moonlight mode (sub-1 lumen) preserves night vision and extends battery life. Our EDC score weights runtime (30%), flood coverage (20%), price (20%), durability (15%), and lumens (15%)."
    }
  },
  camping: {
    label: "Camping & Outdoors",
    rankingKey: "flood",
    useCaseFilter: "camping",
    sortField: "flood_score",
    h1: "Best Flashlights for Camping & Outdoors",
    description:
      "Top camping flashlights ranked by flood output, runtime, and value. Bright, long-lasting illumination for the outdoors.",
    guide: {
      title: "Picking a Camping Flashlight",
      content:
        "Camping flashlights prioritize long runtime and wide, even illumination over raw throw distance. Look for models with 4+ hour medium-mode runtime, good flood beam patterns, and at least IPX4 water resistance. Magnetic tailcaps are useful for hands-free use in tents. Our flood score — which powers this category — weights lumens (50%), runtime (25%), price (15%), and durability (10%)."
    }
  },
  survival: {
    label: "Survival",
    rankingKey: "tactical",
    useCaseFilter: "survival",
    sortField: "tactical_score",
    h1: "Best Flashlights for Survival",
    description:
      "Top survival flashlights ranked by durability, reliability, and runtime. Built to withstand the toughest conditions when failure is not an option.",
    guide: {
      title: "What Makes a Great Survival Flashlight?",
      content:
        "A survival flashlight must be utterly reliable. Look for bomb-proof construction (potted electronics, sealed housings), high impact resistance (2m+), IPX8 waterproofing, and long runtime on medium modes. Common battery types like AA or CR123A are preferred for field availability. Brands like Elzetta, MagLite, Coast Polysteel, and Streamlight Siege are built for worst-case scenarios. Our survival ranking uses the tactical score, emphasizing durability and runtime."
    }
  },
  diving: {
    label: "Diving & Maritime",
    rankingKey: "tactical",
    useCaseFilter: "diving",
    sortField: "tactical_score",
    h1: "Best Dive Lights & Maritime Flashlights",
    description:
      "Top dive lights and underwater flashlights ranked for submersible performance. IPX8 rated for deep-sea diving and maritime use.",
    guide: {
      title: "Choosing a Dive Light",
      content:
        "Dive lights must be rated for actual submersion depth — not just splash-proof IPX4. Look for IPX8 ratings with manufacturer depth specifications (100m+ for recreational diving). Narrow beam angles (6-12 degrees) provide focused illumination underwater, while wider beams are better for video. Magnetic or rotary switches are preferred for gloved operation. Brands like OrcaTorch, ScubaPro, Wurkkos, and Underwater Kinetics specialize in submersible illumination."
    }
  },
  "search-rescue": {
    label: "Search & Rescue",
    rankingKey: "throw",
    useCaseFilter: "search-rescue",
    sortField: "throw_score",
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
    sortField: "value_score",
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
    sortField: "throw_score",
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
    sortField: "flood_score",
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

export const revalidate = 3600;

// Cap the number of cards rendered on "best of" category/composite pages.
// These are top-N rankings — beyond ~48 the marginal SEO/UX value is near
// zero and it just bloats the HTML payload. The ItemList schema only ever
// emits the top 10 regardless.
const CATEGORY_CARD_LIMIT = 48;

// Pre-render: the 9 hand-curated category pages PLUS a curated set of
// composite-filter combos (brand × use_case, use_case × budget, use_case ×
// battery). Composite combos beyond this list still resolve via ISR.
export async function generateStaticParams() {
  const categoryParams = Object.keys(categoryMap).map((category) => ({ category }));

  let brandSlugs: string[] = [];
  try {
    const brands = await fetchBrandsDetailed();
    brandSlugs = brands.map((b) => b.slug).filter(Boolean);
  } catch {
    // API offline at build → ship just the static categories. Composite
    // pages will still build on first hit via ISR.
    return categoryParams;
  }

  const compositeParams: { category: string }[] = [];
  const useCases = ["tactical", "edc", "camping", "search-rescue", "survival", "diving"];

  // Brand × use_case (highest-value combos: "best fenix tactical flashlight")
  for (const brand of brandSlugs) {
    for (const uc of useCases) {
      compositeParams.push({ category: `${brand}-${uc}` });
    }
  }

  // Use_case × budget ("best edc flashlight under $100")
  for (const uc of useCases) {
    for (const budget of CURATED_COMPOSITE_SEEDS.budgets) {
      compositeParams.push({ category: `${uc}-under-${budget}` });
    }
  }

  // Use_case × battery ("best 21700 tactical flashlight")
  for (const uc of useCases) {
    for (const battery of CURATED_COMPOSITE_SEEDS.batteries) {
      compositeParams.push({ category: `${uc}-${battery}` });
    }
  }

  return [...categoryParams, ...compositeParams];
}

// resolveBrandSlugs fetches the {slug -> display name} map used by the
// composite parser. Cached by Next's fetch revalidation.
async function resolveBrandSlugs(): Promise<Map<string, string>> {
  try {
    const brands = await fetchBrandsDetailed();
    return new Map(brands.map((b) => [b.slug, b.name]));
  } catch {
    return new Map();
  }
}

// fetchCompositeItems runs a composite filter against the catalog. Shared by
// generateMetadata (for the noindex-when-empty decision) and CompositePage
// (for rendering) — Next dedupes the identical underlying fetch so this is a
// single round trip per request.
async function fetchCompositeItems(filter: CompositeFilter): Promise<FlashlightItem[]> {
  const sortField = filter.useCase ? `${filter.useCase}_score` : "overall_score";
  try {
    const res = await fetchFlashlights({
      brand: filter.brandName,
      useCase: filter.useCase,
      batteryType: filter.batteryType,
      maxPrice: filter.maxPrice,
      minPrice: filter.minPrice,
      sortBy: sortField,
      order: "desc",
      pageSize: 100,
    });
    return res.items;
  } catch {
    return [];
  }
}

async function countCompositeMatches(filter: CompositeFilter): Promise<number> {
  const items = await fetchCompositeItems(filter);
  return items.length;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const config = categoryMap[category];
  if (config) {
    return {
      title: `${config.h1} 2026 — Ranked by Expert Score`,
      description: config.description,
      alternates: { canonical: `/best-flashlights/${category}` }
    };
  }

  const brandSlugs = await resolveBrandSlugs();
  const composite = parseCompositeFilter(category, brandSlugs);
  if (composite) {
    const canonicalSlug = composeCompositeSlug(composite);
    // A composite filter that currently matches zero products is a thin page.
    // Keep it reachable (follow) but noindex it so we never get thin landing
    // pages into the index — they get indexed again automatically once the
    // catalog grows to match the filter. (fetch() is deduped with the page
    // body's identical query, so this doesn't cost an extra round trip.)
    const count = await countCompositeMatches(composite);
    return {
      title: renderCompositeTitle(composite),
      description: renderCompositeDescription(composite),
      alternates: { canonical: `/best-flashlights/${canonicalSlug}` },
      robots: count === 0 ? { index: false, follow: true } : undefined,
    };
  }

  return { title: "Category Not Found" };
}

type ScoredCard = {
  id: number;
  brand: string;
  name: string;
  slug: string;
  image_url?: string;
  amazon_url?: string;
  max_lumens?: number;
  beam_distance_m?: number;
  waterproof_rating?: string;
  price_usd?: number;
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
  score: number;
};

function getScore(item: ScoredCard, field?: string): number {
  switch (field) {
    case "tactical_score": return item.tactical_score || 0;
    case "edc_score": return item.edc_score || 0;
    case "value_score": return item.value_score || 0;
    case "throw_score": return item.throw_score || 0;
    case "flood_score": return item.flood_score || 0;
    default: return item.score;
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const config = categoryMap[category];

  if (!config) {
    // Not a hand-curated category — try parsing as a composite filter
    // (e.g. "olight-edc-under-100"). If that fails too, 404.
    const brandSlugs = await resolveBrandSlugs();
    const composite = parseCompositeFilter(category, brandSlugs);
    if (composite) {
      return <CompositePage filter={composite} />;
    }
    notFound();
  }

  const useFiltered = !!config.useCaseFilter;

  const [rankingData, filteredData] = await Promise.all([
    fetchRankings(config.rankingKey, 200).catch(() => ({ items: [] as never[] })),
    useFiltered
      ? fetchFlashlights({
          useCase: config.useCaseFilter,
          pageSize: 200,
          sortBy: config.sortField,
          order: "desc",
        }).catch(() => ({
          page: 1,
          page_size: 0,
          total: 0,
          total_pages: 0,
          items: [] as never[],
        }))
      : Promise.resolve(null),
  ]);

  let cards: ScoredCard[];
  if (filteredData && filteredData.items.length > 0) {
    cards = filteredData.items.map((item, i) => ({
      id: item.id,
      brand: item.brand,
      name: item.name,
      slug: item.slug,
      image_url: item.image_url,
      amazon_url: item.amazon_url,
      max_lumens: item.max_lumens,
      beam_distance_m: item.beam_distance_m,
      waterproof_rating: item.waterproof_rating,
      price_usd: item.price_usd,
      tactical_score: item.tactical_score,
      edc_score: item.edc_score,
      value_score: item.value_score,
      throw_score: item.throw_score,
      flood_score: item.flood_score,
      score: getScore(item as unknown as ScoredCard, config.sortField) || 0,
    }));
    cards.sort((a, b) => getScore(b, config.sortField) - getScore(a, config.sortField));
  } else {
    cards = rankingData.items.map((item) => ({
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
      tactical_score: item.profile === "tactical" ? item.score : undefined,
      edc_score: item.profile === "edc" ? item.score : undefined,
      value_score: item.profile === "value" ? item.score : undefined,
      throw_score: item.profile === "throw" ? item.score : undefined,
      flood_score: item.profile === "flood" ? item.score : undefined,
      score: item.score,
    }));
  }

  return (
    <section className="grid">
      <BreadcrumbStructuredData items={[{ name: "Best Flashlights", href: "/best-flashlights" }, { name: config.label }]} />
      <ItemListStructuredData
        name={config.h1}
        items={cards.slice(0, 10).map((item, i) => ({
          position: i + 1,
          name: `${item.brand} ${item.name}`,
          url: item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`,
          image: item.image_url,
          price: item.price_usd
        }))}
      />
      <Breadcrumbs items={[{ label: "Best Flashlights", href: "/best-flashlights" }, { label: config.label }]} />

      <div className="panel hero">
        <p className="kicker">{config.label} Category</p>
        <h1>{config.h1}</h1>
        <p className="muted" style={{ maxWidth: 620 }}>{config.description}</p>
      </div>

      <div className="card-grid">
        {cards.slice(0, CATEGORY_CARD_LIMIT).map((item, i) => (
          <FlashlightCard
            key={item.id}
            rank={i + 1}
            item={{
              id: item.id,
              brand: item.brand,
              name: item.name,
              slug: item.slug,
              image_url: item.image_url,
              amazon_url: item.amazon_url,
              max_lumens: item.max_lumens,
              beam_distance_m: item.beam_distance_m,
              waterproof_rating: item.waterproof_rating,
              price_usd: item.price_usd,
              tactical_score: item.tactical_score,
              edc_score: item.edc_score,
              value_score: item.value_score,
              throw_score: item.throw_score,
              flood_score: item.flood_score,
            }}
          />
        ))}
      </div>

      {cards.length === 0 && (
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
            .filter(([slug]) => slug !== category)
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

// ─── Composite filter renderer ──────────────────────────────────────────
// Generic landing page for parsed composite filter slugs. Re-uses the
// FlashlightCard grid + ItemList schema so SEO surface is consistent with
// hand-curated category pages.
async function CompositePage({ filter }: { filter: CompositeFilter }) {
  const canonicalSlug = composeCompositeSlug(filter);
  const h1 = renderCompositeH1(filter);
  const description = renderCompositeDescription(filter);

  // Map composite filter dimensions onto the API's flashlight listing via the
  // shared helper (deduped with the generateMetadata count query).
  const items = await fetchCompositeItems(filter);

  // Internal-link suggestions: drop one filter dimension at a time so users
  // (and crawlers) can click "broader" search variants. This forms the
  // composite-page link graph that helps Google discover the long tail.
  const broaderLinks: { label: string; href: string }[] = [];
  if (filter.brandName) {
    const without = { ...filter, brandSlug: undefined, brandName: undefined };
    const slug = composeCompositeSlug(without);
    if (slug) broaderLinks.push({ label: `All ${renderCompositeH1(without)}`, href: `/best-flashlights/${slug}` });
  }
  if (filter.useCase) {
    const without = { ...filter, useCase: undefined };
    const slug = composeCompositeSlug(without);
    if (slug) broaderLinks.push({ label: renderCompositeH1(without), href: `/best-flashlights/${slug}` });
  }
  if (filter.maxPrice !== undefined) {
    const without = { ...filter, maxPrice: undefined };
    const slug = composeCompositeSlug(without);
    if (slug) broaderLinks.push({ label: `${renderCompositeH1(without)} (any price)`, href: `/best-flashlights/${slug}` });
  }
  if (filter.batteryType) {
    const without = { ...filter, batteryType: undefined };
    const slug = composeCompositeSlug(without);
    if (slug) broaderLinks.push({ label: renderCompositeH1(without), href: `/best-flashlights/${slug}` });
  }

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Best Flashlights", href: "/best-flashlights" },
          { name: h1 },
        ]}
      />
      <ItemListStructuredData
        name={h1}
        items={items.slice(0, 10).map((item, i) => ({
          position: i + 1,
          name: `${item.brand} ${item.name}`,
          url: item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`,
          image: item.image_url,
          price: item.price_usd,
        }))}
      />
      <Breadcrumbs
        items={[
          { label: "Best Flashlights", href: "/best-flashlights" },
          { label: h1 },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Filtered Picks</p>
        <h1>{h1}</h1>
        <p className="muted" style={{ maxWidth: 620 }}>{description}</p>
      </div>

      <div className="card-grid">
        {items.slice(0, CATEGORY_CARD_LIMIT).map((item) => (
          <FlashlightCard key={item.id} item={item} />
        ))}
      </div>

      {items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">
            No flashlights match this filter combination yet.{" "}
            <Link href="/best-flashlights">Browse all categories.</Link>
          </p>
        </div>
      )}

      {broaderLinks.length > 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Broaden Your Search</h3>
          <div className="spec-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {broaderLinks.map((link) => (
              <Link key={link.href} href={link.href} className="chip">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <AmazonDisclosure />
    </section>
  );
}
