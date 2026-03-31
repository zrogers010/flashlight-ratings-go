"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

const USE_CASES = [
  { value: "edc", label: "EDC" },
  { value: "tactical", label: "Tactical" },
  { value: "camping", label: "Camping" },
  { value: "search-rescue", label: "Search & Rescue" },
  { value: "throw", label: "Max Throw" },
  { value: "flood", label: "Flood" },
  { value: "value", label: "Best Value" },
];

const BATTERY_TYPES = [
  { value: "18650", label: "18650" },
  { value: "21700", label: "21700" },
  { value: "AA", label: "AA" },
  { value: "AAA", label: "AAA" },
  { value: "CR123A", label: "CR123A" },
  { value: "18350", label: "18350" },
];

const PRICE_RANGES = [
  { value: "50", label: "Under $50", min: undefined, max: 50 },
  { value: "100", label: "$50–$100", min: 50, max: 100 },
  { value: "200", label: "$100–$200", min: 100, max: 200 },
  { value: "300", label: "$200–$300", min: 200, max: 300 },
  { value: "300+", label: "$300+", min: 300, max: undefined },
];

function useFilterActions() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const applyFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get(key) === value) {
        params.delete(key);
        if (key === "price") {
          params.delete("min_price");
          params.delete("max_price");
        }
      } else {
        params.set(key, value);
        if (key === "price") {
          const range = PRICE_RANGES.find((r) => r.value === value);
          if (range) {
            if (range.min !== undefined) params.set("min_price", String(range.min));
            else params.delete("min_price");
            if (range.max !== undefined) params.set("max_price", String(range.max));
            else params.delete("max_price");
          }
        }
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push("?", { scroll: false });
  }, [router]);

  return { searchParams, applyFilter, clearAll };
}

export function FilterBar() {
  const { searchParams, applyFilter, clearAll } = useFilterActions();
  const currentUseCase = searchParams.get("use_case") || "";
  const currentBattery = searchParams.get("battery_type") || "";
  const currentPrice = searchParams.get("price") || "";
  const hasAny = currentUseCase || currentBattery || currentPrice || searchParams.get("brand");

  return (
    <div className="filter-bar">
      <div className="filter-bar-group">
        <span className="filter-bar-label">Use Case</span>
        <div className="filter-chips">
          {USE_CASES.map((uc) => (
            <button
              key={uc.value}
              className={`chip ${currentUseCase === uc.value ? "active" : ""}`}
              onClick={() => applyFilter("use_case", uc.value)}
            >
              {uc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar-group">
        <span className="filter-bar-label">Battery</span>
        <div className="filter-chips">
          {BATTERY_TYPES.map((bt) => (
            <button
              key={bt.value}
              className={`chip ${currentBattery === bt.value ? "active" : ""}`}
              onClick={() => applyFilter("battery_type", bt.value)}
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar-group">
        <span className="filter-bar-label">Price</span>
        <div className="filter-chips">
          {PRICE_RANGES.map((pr) => (
            <button
              key={pr.value}
              className={`chip ${currentPrice === pr.value ? "active" : ""}`}
              onClick={() => applyFilter("price", pr.value)}
            >
              {pr.label}
            </button>
          ))}
        </div>
      </div>

      {hasAny && (
        <button className="btn-clear" onClick={clearAll}>
          Clear all
        </button>
      )}
    </div>
  );
}

export function BrandSidebar({ brands }: { brands: string[] }) {
  const { searchParams, applyFilter } = useFilterActions();
  const currentBrand = searchParams.get("brand") || "";
  const [expanded, setExpanded] = useState(false);

  if (brands.length === 0) return null;

  const visible = expanded ? brands : brands.slice(0, 15);

  return (
    <aside className="brand-sidebar">
      <h4 className="brand-sidebar-title">Brands</h4>
      <ul className="brand-list">
        {visible.map((b) => (
          <li key={b}>
            <button
              className={`brand-item ${currentBrand === b ? "active" : ""}`}
              onClick={() => applyFilter("brand", b)}
            >
              {b}
            </button>
          </li>
        ))}
      </ul>
      {brands.length > 15 && (
        <button
          className="brand-show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show all ${brands.length}`}
        </button>
      )}
    </aside>
  );
}
