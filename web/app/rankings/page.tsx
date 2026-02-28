import type { Metadata } from "next";
import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RankingsTable } from "@/components/RankingsTable";
import { fetchRankings } from "@/lib/api";

const useCases = ["overall", "tactical", "edc", "value", "throw", "flood"] as const;
const useCaseLabel: Record<(typeof useCases)[number], string> = {
  overall: "Overall",
  tactical: "Tactical",
  edc: "EDC",
  value: "Value",
  throw: "Throw",
  flood: "Flood"
};

const useCaseDesc: Record<(typeof useCases)[number], string> = {
  overall: "All flashlights ranked by composite performance across every scoring dimension.",
  tactical: "Ranked by candela, runtime, durability, and throw — optimized for law enforcement and defense.",
  edc: "Ranked by runtime, flood, price, and size — optimized for everyday pocket carry.",
  value: "Ranked by performance-per-dollar — the best specs for the lowest price.",
  throw: "Ranked by candela and beam distance — the farthest-reaching flashlights.",
  flood: "Ranked by lumen output and coverage — the brightest, widest beams."
};

export async function generateMetadata({
  searchParams
}: {
  searchParams?: { use_case?: string };
}): Promise<Metadata> {
  const selected = useCases.includes((searchParams?.use_case || "") as (typeof useCases)[number])
    ? (searchParams!.use_case as (typeof useCases)[number])
    : "overall";

  return {
    title: `Best ${useCaseLabel[selected]} Flashlights 2026 — Top Ranked by Algorithm`,
    description: useCaseDesc[selected],
    alternates: { canonical: `/rankings${selected !== "overall" ? `?use_case=${selected}` : ""}` }
  };
}

export default async function RankingsPage({
  searchParams
}: {
  searchParams?: { use_case?: string };
}) {
  const sp = searchParams || {};
  const selected = useCases.includes((sp.use_case || "") as (typeof useCases)[number])
    ? (sp.use_case as (typeof useCases)[number])
    : "overall";
  const data = await fetchRankings(selected, 500);

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Rankings" }]} />

      <div className="panel hero">
        <p className="kicker">Algorithmic Rankings</p>
        <h1>{useCaseLabel[selected]} Flashlight Rankings</h1>
        <p className="muted" style={{ maxWidth: 620, marginBottom: 16 }}>
          {useCaseDesc[selected]}
        </p>
        <div className="filters">
          {useCases.map((u) => (
            <Link
              key={u}
              href={`/rankings?use_case=${u}`}
              className={u === selected ? "active" : ""}
            >
              {useCaseLabel[u]}
            </Link>
          ))}
        </div>
      </div>

      <div className="panel panel-flush">
        <RankingsTable items={data.items} />
      </div>

      <AmazonDisclosure />
    </section>
  );
}
