"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RankingItem } from "@/lib/api";
import Link from "next/link";
import { AmazonCTA } from "@/components/AmazonCTA";
import { ScoreBadge } from "@/components/ScoreBadge";

type SortKey = "rank" | "score" | "brand" | "name";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ opacity: 0.3 }}>↕</span>;
  return <span>{dir === "asc" ? "↑" : "↓"}</span>;
}

export function RankingsTable({ items }: { items: RankingItem[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function onSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(next);
    setSortDir(next === "rank" ? "asc" : "desc");
  }

  const sorted = useMemo(() => {
    const out = [...items];
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "score":
          cmp = a.score - b.score;
          break;
        case "brand":
          cmp = a.flashlight.brand.localeCompare(b.flashlight.brand);
          break;
        case "name":
          cmp = a.flashlight.name.localeCompare(b.flashlight.name);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [items, sortDir, sortKey]);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>
              <button onClick={() => onSort("rank")}>
                Rank <SortIcon active={sortKey === "rank"} dir={sortDir} />
              </button>
            </th>
            <th style={{ width: 70 }}>
              <button onClick={() => onSort("score")}>
                Score <SortIcon active={sortKey === "score"} dir={sortDir} />
              </button>
            </th>
            <th className="hide-mobile" style={{ width: 60 }}>Image</th>
            <th className="hide-mobile">
              <button onClick={() => onSort("brand")}>
                Brand <SortIcon active={sortKey === "brand"} dir={sortDir} />
              </button>
            </th>
            <th>
              <button onClick={() => onSort("name")}>
                Model <SortIcon active={sortKey === "name"} dir={sortDir} />
              </button>
            </th>
            <th className="hide-mobile" style={{ width: 160 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr
              key={`${item.profile}-${item.flashlight.id}`}
              className="clickable-row"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) return;
                router.push(`/flashlights/${item.flashlight.id}`);
              }}
            >
              <td>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: item.rank <= 3 ? "var(--accent)" : "var(--text-secondary)"
                }}>
                  #{item.rank}
                </span>
              </td>
              <td>
                <ScoreBadge score={item.score} size="sm" />
              </td>
              <td className="hide-mobile">
                {item.flashlight.image_url ? (
                  <img className="table-thumb" src={item.flashlight.image_url} alt={item.flashlight.name} />
                ) : (
                  <span className="badge">—</span>
                )}
              </td>
              <td className="hide-mobile" style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                {item.flashlight.brand}
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>
                  <Link href={`/flashlights/${item.flashlight.id}`}>
                    {item.flashlight.name}
                  </Link>
                </div>
                <span className="show-mobile-inline" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  {item.flashlight.brand}
                </span>
              </td>
              <td className="hide-mobile">
                <AmazonCTA href={item.flashlight.amazon_url} />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 32 }}>
                No data yet. Run the scoring job first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
