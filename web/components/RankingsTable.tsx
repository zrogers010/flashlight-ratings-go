"use client";

import { useMemo, useState } from "react";
import type { RankingItem } from "@/lib/api";
import Link from "next/link";
import { AmazonCTA } from "@/components/AmazonCTA";

type SortKey = "rank" | "score" | "brand" | "name";

export function RankingsTable({ items }: { items: RankingItem[] }) {
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
            <th>
              <button onClick={() => onSort("rank")}>Rank</button>
            </th>
            <th>
              <button onClick={() => onSort("score")}>Score</button>
            </th>
            <th>
              <button onClick={() => onSort("brand")}>Brand</button>
            </th>
            <th>
              <button onClick={() => onSort("name")}>Model</button>
            </th>
            <th>Image</th>
            <th>Amazon</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr key={`${item.profile}-${item.flashlight.id}`}>
              <td>#{item.rank}</td>
              <td>{item.score.toFixed(2)}</td>
              <td>{item.flashlight.brand}</td>
              <td>
                <Link href={`/flashlights/${item.flashlight.id}`}>
                  {item.flashlight.name}
                </Link>
              </td>
              <td>
                {item.flashlight.image_url ? (
                  <img className="table-thumb" src={item.flashlight.image_url} alt={item.flashlight.name} />
                ) : (
                  <span className="badge">No image</span>
                )}
              </td>
              <td>
                <AmazonCTA href={item.flashlight.amazon_url} />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6}>No data yet. Run the scoring job first.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
