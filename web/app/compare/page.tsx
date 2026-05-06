import type { Metadata } from "next";
import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RankingsTable } from "@/components/RankingsTable";
import { CompareCardView } from "@/components/CompareCardView";
import { PopularComparisons } from "@/components/PopularComparisons";
import { fetchRankings, fetchFlashlightByID, type FlashlightDetail, type RankingItem } from "@/lib/api";

export const revalidate = 3600;

const useCases = ["overall", "tactical", "edc", "value", "throw", "flood"] as const;
const useCaseLabel: Record<(typeof useCases)[number], string> = {
  overall: "Overall",
  tactical: "Tactical",
  edc: "Everyday Carry",
  value: "Value",
  throw: "Throw",
  flood: "Flood"
};

const useCaseDesc: Record<(typeof useCases)[number], string> = {
  overall: "Pick flashlights to compare side by side, or browse all rankings by category.",
  tactical: "Ranked by candela, runtime, durability, and throw — optimized for tactical and defense.",
  edc: "Ranked by runtime, flood, price, and size — optimized for everyday pocket carry.",
  value: "Ranked by performance-per-dollar — the best specs for the lowest price.",
  throw: "Ranked by candela and beam distance — the farthest-reaching flashlights.",
  flood: "Ranked by lumen output and coverage — the brightest, widest beams."
};

export async function generateMetadata({
  searchParams
}: {
  searchParams?: { use_case?: string; ids?: string };
}): Promise<Metadata> {
  if (searchParams?.ids) {
    return {
      title: "Compare Flashlights Side by Side — Specs, Scores & Prices",
      description:
        "Compare flashlight specs, scores, and prices side by side. Find the best option by comparing lumens, throw, runtime, weight, and more."
    };
  }

  const selected = useCases.includes((searchParams?.use_case || "") as (typeof useCases)[number])
    ? (searchParams!.use_case as (typeof useCases)[number])
    : "overall";

  return {
    title: `Best ${useCaseLabel[selected]} Flashlights 2026 — Compare & Rankings`,
    description: useCaseDesc[selected],
    alternates: { canonical: `/compare${selected !== "overall" ? `?use_case=${selected}` : ""}` }
  };
}

export default async function ComparePage({
  searchParams
}: {
  searchParams?: { use_case?: string; ids?: string };
}) {
  const sp = searchParams || {};

  if (sp.ids) {
    return <DetailComparison ids={sp.ids} />;
  }

  const selected = useCases.includes((sp.use_case || "") as (typeof useCases)[number])
    ? (sp.use_case as (typeof useCases)[number])
    : "overall";

  // Pull rankings for the active use case PLUS the three popular profiles so
  // we can build the "Popular Comparisons" tiles dynamically. All in parallel.
  const [activeData, tactical, edc, value] = await Promise.all([
    fetchRankings(selected, 500),
    selected === "tactical" ? Promise.resolve({ items: [] as RankingItem[] }) : fetchRankings("tactical", 2),
    selected === "edc" ? Promise.resolve({ items: [] as RankingItem[] }) : fetchRankings("edc", 2),
    selected === "value" ? Promise.resolve({ items: [] as RankingItem[] }) : fetchRankings("value", 2),
  ]);

  // For the active use case, derive its top-2 from the same payload (avoids a 5th call).
  const activeTop2 = activeData.items.slice(0, 2);

  const pairs = [
    {
      label: `Top ${useCaseLabel[selected]}`,
      description: `The two highest-scoring ${useCaseLabel[selected].toLowerCase()} flashlights, head to head.`,
      items: activeTop2,
    },
    selected !== "tactical"
      ? {
          label: "Top Tactical",
          description: "Highest-scoring tactical lights — bright, durable, fast deployment.",
          items: tactical.items,
        }
      : null,
    selected !== "edc"
      ? {
          label: "Top EDC",
          description: "Best everyday-carry picks — pocket-friendly with balanced runtime.",
          items: edc.items,
        }
      : null,
    selected !== "value"
      ? {
          label: "Top Value",
          description: "Most performance per dollar — strong specs at low prices.",
          items: value.items,
        }
      : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Compare" }]} />

      <div className="panel hero">
        <p className="kicker">Compare & Rankings</p>
        <h1>
          {selected === "overall"
            ? "Compare Flashlights & Rankings"
            : `${useCaseLabel[selected]} Flashlight Rankings`}
        </h1>
        <p className="muted" style={{ maxWidth: 620, marginBottom: 16 }}>
          {useCaseDesc[selected]}
        </p>
        <div className="filters">
          {useCases.map((u) => (
            <Link
              key={u}
              href={`/compare?use_case=${u}`}
              className={u === selected ? "active" : ""}
            >
              {useCaseLabel[u]}
            </Link>
          ))}
        </div>
      </div>

      <PopularComparisons pairs={pairs} />

      <div className="panel panel-flush">
        <div className="panel-section-intro">
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px" }}>Or build your own comparison</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Tick the box on any row to add it to the compare cart. Compare up to 4 at a time.
          </p>
        </div>
        <RankingsTable items={activeData.items} preselectTopN={3} />
      </div>

      <AmazonDisclosure />
    </section>
  );
}

async function DetailComparison({ ids: idStr }: { ids: string }) {
  const ids = idStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4); // hard cap at 4 for layout sanity

  const results = await Promise.allSettled(ids.map((id) => fetchFlashlightByID(id)));
  const items = results
    .filter((r): r is PromiseFulfilledResult<FlashlightDetail> => r.status === "fulfilled")
    .map((r) => r.value);

  if (items.length < 2) {
    return (
      <section className="grid">
        <Breadcrumbs items={[{ label: "Compare", href: "/compare" }, { label: "Side by Side" }]} />
        <div className="panel hero" style={{ textAlign: "center" }}>
          <p className="kicker">Side-by-Side Comparison</p>
          <h1>Compare Flashlights</h1>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
            {items.length === 1
              ? "Only 1 flashlight was found. Add at least one more to compare."
              : "Select 2 or more flashlights from the rankings to compare side by side."}
          </p>
          <Link href="/compare" className="button-link">
            ← Back to Rankings
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="grid compare-detail-section">
      <Breadcrumbs items={[{ label: "Compare", href: "/compare" }, { label: "Side by Side" }]} />

      <div className="panel hero">
        <p className="kicker">Side-by-Side Comparison</p>
        <h1>Compare {items.length} Flashlights</h1>
        <p className="muted">
          Key specs, scores, and Amazon prices at a glance. Winner badges show which model leads each profile.
          Expand the full spec comparison below for the deep dive.
        </p>
      </div>

      <CompareCardView items={items} showFullSpecsToggle />

      <div className="panel" style={{ textAlign: "center" }}>
        <Link href="/compare" className="button-link button-secondary">
          ← Back to Rankings
        </Link>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
