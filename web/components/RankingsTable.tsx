"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RankingItem } from "@/lib/api";
import Link from "next/link";
import { BuyOnAmazonButton } from "@/components/BuyOnAmazonButton";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { useCompareStore } from "@/lib/compare-store";

type SortKey = "rank" | "score" | "brand" | "name";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ opacity: 0.3 }}>↕</span>;
  return <span>{dir === "asc" ? "↑" : "↓"}</span>;
}

export function RankingsTable({
  items,
  preselectTopN = 0,
}: {
  items: RankingItem[];
  /**
   * If > 0, replace the global compare cart with the top N ranked items from
   * this list whenever those top N change (initial mount + use-case switches).
   * This makes /compare land with a meaningful checked example so the user can
   * see what a comparison looks like and tweak from there.
   */
  preselectTopN?: number;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [mounted, setMounted] = useState(false);

  const compareItems = useCompareStore((s) => s.items);
  const addCompare = useCompareStore((s) => s.add);
  const removeCompare = useCompareStore((s) => s.remove);
  const clearCompare = useCompareStore((s) => s.clear);

  useEffect(() => setMounted(true), []);

  // Stable signature of the items we'd seed. Re-seed whenever it changes
  // (e.g. user switches use-case filter and the top 4 differ).
  const seedSignature = useMemo(() => {
    if (preselectTopN <= 0) return "";
    return [...items]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, preselectTopN)
      .map((i) => i.flashlight.id)
      .join(",");
  }, [items, preselectTopN]);

  useEffect(() => {
    if (!mounted || !seedSignature) return;

    const seed = [...items]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, preselectTopN)
      .map((i) => ({
        id: i.flashlight.id,
        brand: i.flashlight.brand,
        name: i.flashlight.name,
        image_url: i.flashlight.image_url,
      }));

    clearCompare();
    for (const item of seed) addCompare(item);
    // Items + preselectTopN are captured via seedSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, seedSignature]);

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

  const isFull = compareItems.length >= 4;

  return (
    <div className="table-wrap">
      {mounted && compareItems.length > 0 && (
        <div className="table-compare-hint">
          {compareItems.length} selected
          {compareItems.length >= 2 && (
            <Link href={`/compare?ids=${compareItems.map((i) => i.id).join(",")}`} className="button-link btn-sm">
              Compare →
            </Link>
          )}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th style={{ width: 56, textAlign: "center", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-tertiary)" }}>
              Compare
            </th>
            <th style={{ width: 54 }}>
              <button onClick={() => onSort("rank")}>
                Rank <SortIcon active={sortKey === "rank"} dir={sortDir} />
              </button>
            </th>
            <th style={{ width: 64 }}>
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
            <th className="hide-mobile" style={{ width: 90 }}>Lumens</th>
            <th className="hide-mobile" style={{ width: 90 }}>Throw</th>
            <th className="hide-mobile" style={{ width: 160 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const isChecked = mounted && compareItems.some((c) => c.id === item.flashlight.id);
            const disabled = isFull && !isChecked;

            return (
              <tr
                key={`${item.profile}-${item.flashlight.id}`}
                className={`clickable-row ${isChecked ? "row-compare-active" : ""}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("a") || target.closest(".compare-cell")) return;
                  router.push(
                    item.flashlight.slug
                      ? `/reviews/${item.flashlight.slug}`
                      : `/flashlights/${item.flashlight.id}`
                  );
                }}
              >
                <td
                  className="compare-cell"
                  style={{ textAlign: "center" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (disabled) return;
                    if (isChecked) {
                      removeCompare(item.flashlight.id);
                    } else {
                      addCompare({
                        id: item.flashlight.id,
                        brand: item.flashlight.brand,
                        name: item.flashlight.name,
                        image_url: item.flashlight.image_url,
                      });
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    className="compare-checkbox"
                    checked={isChecked}
                    disabled={disabled}
                    readOnly
                    aria-label={`Compare ${item.flashlight.brand} ${item.flashlight.name}`}
                  />
                </td>
                <td>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                  }}>
                    #{item.rank}
                  </span>
                </td>
                <td>
                  <ScoreBadge score={item.score} size="sm" />
                </td>
                <td className="hide-mobile">
                  <ImageWithFallback src={item.flashlight.image_url} alt={item.flashlight.name} />
                </td>
                <td className="hide-mobile" style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                  {item.flashlight.brand}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link
                      href={
                        item.flashlight.slug
                          ? `/reviews/${item.flashlight.slug}`
                          : `/flashlights/${item.flashlight.id}`
                      }
                    >
                      {item.flashlight.name}
                    </Link>
                  </div>
                  <span className="show-mobile-inline" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                    {item.flashlight.brand}
                  </span>
                </td>
                <td className="hide-mobile" style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                  {item.flashlight.max_lumens ? item.flashlight.max_lumens.toLocaleString() : "—"}
                </td>
                <td className="hide-mobile" style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                  {item.flashlight.beam_distance_m ? `${item.flashlight.beam_distance_m}m` : "—"}
                </td>
                <td className="hide-mobile">
                  <BuyOnAmazonButton amazon_url={item.flashlight.amazon_url} price_usd={item.flashlight.price_usd} />
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 32 }}>
                No data yet. Run the scoring job first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
