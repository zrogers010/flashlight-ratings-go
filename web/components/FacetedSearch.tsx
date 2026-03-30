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
  { value: "100", label: "$50 – $100", min: 50, max: 100 },
  { value: "200", label: "$100 – $200", min: 100, max: 200 },
  { value: "300", label: "$200 – $300", min: 200, max: 300 },
  { value: "300+", label: "$300+", min: 300, max: undefined },
];

export function FacetedSearch({ brands }: { brands: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentUseCase = searchParams.get("use_case") || "";
  const currentBattery = searchParams.get("battery_type") || "";
  const currentBrand = searchParams.get("brand") || "";
  const currentPrice = searchParams.get("price") || "";

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

  const hasAnyFilter = currentUseCase || currentBattery || currentBrand || currentPrice;

  const sidebar = (
    <div className="faceted-search">
      <div className="faceted-header">
        <h3>Filters</h3>
        {hasAnyFilter && (
          <button className="btn-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      <div className="filter-group">
        <h4>Use Case</h4>
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

      <div className="filter-group">
        <h4>Battery Type</h4>
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

      <div className="filter-group">
        <h4>Price Range</h4>
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

      {brands.length > 0 && (
        <div className="filter-group">
          <h4>Brand</h4>
          <div className="filter-chips">
            {brands.map((b) => (
              <button
                key={b}
                className={`chip ${currentBrand === b ? "active" : ""}`}
                onClick={() => applyFilter("brand", b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        className="btn btn-ghost filter-toggle-mobile"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
        Filters{hasAnyFilter ? " (active)" : ""}
      </button>

      {mobileOpen && (
        <div className="mobile-filter-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`filter-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="filter-sidebar-mobile-header">
          <h3>Filters</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => setMobileOpen(false)}>
            Close
          </button>
        </div>
        {sidebar}
      </aside>
    </>
  );
}
