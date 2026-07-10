"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { ImageWithFallback } from "./ImageWithFallback";
import { BuyOnAmazonButton } from "./BuyOnAmazonButton";
import { SpecBadge } from "./SpecBadge";
import {
  SPEC_DEFS,
  SPEC_GROUPS,
  formatSpecValue,
  findBestIndex,
} from "@/lib/spec-config";
import type { FlashlightDetail } from "@/lib/api";
import { productUrl } from "@/lib/compare-url";

const BeamViz = lazy(() =>
  import("./BeamViz").then((m) => ({ default: m.BeamViz }))
);

type Props = {
  items: FlashlightDetail[];
};

function getSpecValue(item: FlashlightDetail, key: string): unknown {
  return (item as Record<string, unknown>)[key];
}

export function CompareTable({ items }: Props) {
  const [hideSimilar, setHideSimilar] = useState(false);
  const [highlightDiffs, setHighlightDiffs] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const maxDistance = useMemo(
    () => Math.max(...items.map((i) => i.beam_distance_m ?? 0), 100),
    [items]
  );

  const specRows = useMemo(() => {
    return SPEC_DEFS.map((spec) => {
      const values = items.map((item) => getSpecValue(item, spec.key));
      const formatted = values.map((v) => formatSpecValue(v, spec));
      const bestIdx = findBestIndex(values, spec);

      const allSame =
        formatted.length > 1 &&
        formatted.every((f) => f === formatted[0]);

      const hasAnyData = formatted.some((f) => f !== "—");

      return {
        spec,
        values,
        formatted,
        bestIdx,
        allSame,
        hasAnyData,
      };
    });
  }, [items]);

  const hiddenCount = hideSimilar
    ? specRows.filter((r) => r.allSame && r.hasAnyData).length
    : 0;

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <div className="compare-controls">
        <label className="compare-toggle-label">
          <input
            type="checkbox"
            checked={hideSimilar}
            onChange={(e) => setHideSimilar(e.target.checked)}
          />
          <span>Hide identical specs</span>
        </label>
        <label className="compare-toggle-label">
          <input
            type="checkbox"
            checked={highlightDiffs}
            onChange={(e) => setHighlightDiffs(e.target.checked)}
          />
          <span>Highlight differences</span>
        </label>
        {hiddenCount > 0 && (
          <span className="compare-hidden-count muted">
            Hiding {hiddenCount} identical {hiddenCount === 1 ? "row" : "rows"}
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="compare-row-label">Spec</th>
              {items.map((item) => (
                <th key={item.id} className="compare-model-head">
                  <div style={{ padding: "4px 0" }}>
                    <div className="compare-head-image">
                      <ImageWithFallback
                        src={item.image_url}
                        alt={`${item.brand} ${item.name}`}
                      />
                    </div>
                    <h4>
                      <Link href={productUrl(item)}>
                        {item.brand} {item.name}
                      </Link>
                    </h4>
                    <div className="spec-row" style={{ justifyContent: "center", marginTop: 6 }}>
                      {item.max_lumens != null && item.max_lumens > 1 && (
                        <SpecBadge type="lumens" value={`${item.max_lumens.toLocaleString()} lm`} />
                      )}
                      {item.battery_types?.[0] && (
                        <SpecBadge type="battery" value={item.battery_types[0]} />
                      )}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <BuyOnAmazonButton
                        amazon_url={item.amazon_url}
                        price_usd={item.price_usd}
                        priceUpdatedAt={item.price_last_updated_at}
                      />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Beam visualization row */}
            <tr className="compare-beam-row">
              <td className="compare-row-label">Beam Pattern</td>
              {items.map((item) => (
                <td key={item.id}>
                  <Suspense
                    fallback={
                      <div
                        className="beam-viz-empty"
                        style={{ width: 180, height: 120 }}
                      >
                        <span className="muted" style={{ fontSize: "0.75rem" }}>
                          Loading...
                        </span>
                      </div>
                    }
                  >
                    <BeamViz
                      lumens={item.max_lumens}
                      candela={item.max_candela}
                      beamDistanceM={item.beam_distance_m}
                      beamPattern={item.beam_pattern}
                      maxDistance={maxDistance}
                      width={180}
                      height={120}
                    />
                  </Suspense>
                </td>
              ))}
            </tr>

            {/* Spec groups */}
            {SPEC_GROUPS.map((group) => {
              const groupRows = specRows.filter(
                (r) => r.spec.group === group.key
              );
              const visibleRows = groupRows.filter(
                (r) => r.hasAnyData && !(hideSimilar && r.allSame)
              );

              if (visibleRows.length === 0) return null;

              const isCollapsed = collapsedGroups.has(group.key);

              return [
                <tr key={`group-${group.key}`} className="compare-group-header">
                  <td
                    colSpan={items.length + 1}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <span className="compare-group-toggle">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    {group.label}
                    <span className="compare-group-count">
                      {visibleRows.length}
                    </span>
                  </td>
                </tr>,
                ...(!isCollapsed
                  ? visibleRows.map((row) => {
                      const isDiff = !row.allSame && row.hasAnyData;
                      const isChecklist = row.spec.group === "checklist";
                      return (
                        <tr
                          key={row.spec.key}
                          className={[
                            row.allSame ? "compare-row-same" : "",
                            highlightDiffs && isDiff ? "compare-diff" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <td className="compare-row-label">
                            {row.spec.label}
                          </td>
                          {row.formatted.map((val, i) => (
                            <td
                              key={i}
                              className={
                                row.bestIdx === i ? "compare-best" : ""
                              }
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.9rem",
                              }}
                            >
                              {isChecklist ? (
                                <span className={val === "Yes" ? "check-yes" : val === "No" ? "check-no" : ""}>
                                  {val === "Yes" ? "✓" : val === "No" ? "✗" : val}
                                </span>
                              ) : (
                                val
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
