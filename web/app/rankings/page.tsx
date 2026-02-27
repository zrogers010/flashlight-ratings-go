import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { RankingsTable } from "@/components/RankingsTable";
import { fetchRankings } from "@/lib/api";
import Link from "next/link";

const useCases = ["tactical", "edc", "value", "throw", "flood"] as const;

export default async function RankingsPage({
  searchParams
}: {
  searchParams?: { use_case?: string };
}) {
  const sp = searchParams || {};
  const selected = useCases.includes((sp.use_case || "") as (typeof useCases)[number])
    ? (sp.use_case as (typeof useCases)[number])
    : "tactical";
  const data = await fetchRankings(selected);

  return (
    <section className="grid">
      <div className="panel">
        <p className="kicker">Rankings</p>
        <h1>Flashlight Rankings</h1>
        <p className="muted">Live leaderboard from latest scoring batch.</p>
        <div className="filters">
          {useCases.map((u) => (
            <Link
              key={u}
              href={`/rankings?use_case=${u}`}
              className={u === selected ? "active" : ""}
            >
              {u.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>
      <RankingsTable items={data.items} />
      <AmazonDisclosure />
    </section>
  );
}
