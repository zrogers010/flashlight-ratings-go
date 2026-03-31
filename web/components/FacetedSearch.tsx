"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

const USE_CASES = [
  { value: "edc", label: "EDC / Everyday Carry" },
  { value: "tactical", label: "Tactical / Defense" },
  { value: "law-enforcement", label: "Law Enforcement" },
  { value: "camping", label: "Camping / Outdoors" },
  { value: "search-rescue", label: "Search & Rescue" },
  { value: "weapon-mount", label: "Weapon Mount" },
  { value: "keychain", label: "Keychain / Ultra-Compact" },
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

function useFilterActions() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value) {
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

  return { searchParams, setParam, clearAll };
}

export function FilterBar() {
  const { searchParams, setParam, clearAll } = useFilterActions();
  const currentUseCase = searchParams.get("use_case") || "";
  const currentBattery = searchParams.get("battery_type") || "";
  const currentPrice = searchParams.get("price") || "";
  const hasAny = currentUseCase || currentBattery || currentPrice || searchParams.get("brand");

  return (
    <div className="filter-bar">
      <div className="filter-bar-group">
        <label htmlFor="filter-use-case" className="filter-bar-label">Use Case</label>
        <select
          id="filter-use-case"
          className="filter-select"
          value={currentUseCase}
          onChange={(e) => setParam("use_case", e.target.value)}
        >
          <option value="">Any Use Case</option>
          {USE_CASES.map((uc) => (
            <option key={uc.value} value={uc.value}>{uc.label}</option>
          ))}
        </select>
      </div>

      <div className="filter-bar-group">
        <label htmlFor="filter-battery" className="filter-bar-label">Battery</label>
        <select
          id="filter-battery"
          className="filter-select"
          value={currentBattery}
          onChange={(e) => setParam("battery_type", e.target.value)}
        >
          <option value="">Any Battery</option>
          {BATTERY_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>{bt.label}</option>
          ))}
        </select>
      </div>

      <div className="filter-bar-group">
        <label htmlFor="filter-price" className="filter-bar-label">Price Range</label>
        <select
          id="filter-price"
          className="filter-select"
          value={currentPrice}
          onChange={(e) => setParam("price", e.target.value)}
        >
          <option value="">Any Price</option>
          {PRICE_RANGES.map((pr) => (
            <option key={pr.value} value={pr.value}>{pr.label}</option>
          ))}
        </select>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrands = (searchParams.get("brand") || "").split(",").filter(Boolean);
  const [expanded, setExpanded] = useState(false);

  const toggleBrand = useCallback(
    (brand: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = new Set(selectedBrands);
      if (current.has(brand)) {
        current.delete(brand);
      } else {
        current.add(brand);
      }
      if (current.size === 0) {
        params.delete("brand");
      } else {
        params.set("brand", Array.from(current).join(","));
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedBrands]
  );

  if (brands.length === 0) return null;

  const visible = expanded ? brands : brands.slice(0, 20);

  return (
    <aside className="brand-sidebar">
      <h4 className="brand-sidebar-title">
        Brands
        {selectedBrands.length > 0 && (
          <span className="brand-count">{selectedBrands.length}</span>
        )}
      </h4>
      <ul className="brand-list">
        {visible.map((b) => (
          <li key={b}>
            <label className={`brand-check ${selectedBrands.includes(b) ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={selectedBrands.includes(b)}
                onChange={() => toggleBrand(b)}
              />
              {b}
            </label>
          </li>
        ))}
      </ul>
      {brands.length > 20 && (
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
