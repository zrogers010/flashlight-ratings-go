"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const SORT_OPTIONS = [
  { value: "", label: "Rating (High → Low)" },
  { value: "price_asc", label: "Price (Low → High)" },
  { value: "price_desc", label: "Price (High → Low)" },
] as const;

export function SortDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentValue = useMemo(() => {
    const sb = searchParams.get("sort_by") || "";
    const ord = searchParams.get("order") || "";
    if (sb === "price" && ord === "asc") return "price_asc";
    if (sb === "price" && ord === "desc") return "price_desc";
    return "";
  }, [searchParams]);

  const onChange = useCallback(
    (val: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (val === "price_asc") {
        next.set("sort_by", "price");
        next.set("order", "asc");
      } else if (val === "price_desc") {
        next.set("sort_by", "price");
        next.set("order", "desc");
      } else {
        next.delete("sort_by");
        next.delete("order");
      }
      const q = next.toString();
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="sort-bar">
      <label htmlFor="sort-select" className="sort-bar-label">
        Sort by
      </label>
      <select
        id="sort-select"
        className="filter-select sort-bar-select"
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const USE_CASES = [
  { value: "edc", label: "Everyday Carry" },
  { value: "tactical", label: "Tactical" },
  { value: "camping", label: "Camping & Outdoors" },
  { value: "search-rescue", label: "Search & Rescue" },
  { value: "survival", label: "Survival" },
  { value: "diving", label: "Diving & Maritime" },
  { value: "weapon-mount", label: "Weapon Mount" },
  { value: "keychain", label: "Keychain" },
] as const;

const BATTERY_TYPES = [
  { value: "18650", label: "18650" },
  { value: "21700", label: "21700" },
  { value: "CR123A", label: "CR123A" },
  { value: "AA", label: "AA" },
  { value: "AAA", label: "AAA" },
] as const;

type LumensTier = "" | "500" | "1000" | "2000" | "3000" | "5000" | "10000" | "10000plus";
type ThrowTier = "" | "100" | "200" | "300" | "500" | "500plus";
type PriceTier = "" | "25" | "50" | "100" | "200" | "200plus";

function priceTierFromParams(
  minPrice: string | null,
  maxPrice: string | null
): PriceTier {
  const minV =
    minPrice != null && minPrice !== ""
      ? Number.parseFloat(minPrice)
      : undefined;
  const maxV =
    maxPrice != null && maxPrice !== ""
      ? Number.parseFloat(maxPrice)
      : undefined;
  if (minV === 200 && maxV === undefined) return "200plus";
  if (minV === undefined && maxV === 25) return "25";
  if (minV === undefined && maxV === 50) return "50";
  if (minV === undefined && maxV === 100) return "100";
  if (minV === undefined && maxV === 200) return "200";
  return "";
}

function applyPriceTier(params: URLSearchParams, tier: PriceTier) {
  params.delete("price");
  switch (tier) {
    case "":
      params.delete("min_price");
      params.delete("max_price");
      break;
    case "25":
      params.delete("min_price");
      params.set("max_price", "25");
      break;
    case "50":
      params.delete("min_price");
      params.set("max_price", "50");
      break;
    case "100":
      params.delete("min_price");
      params.set("max_price", "100");
      break;
    case "200":
      params.delete("min_price");
      params.set("max_price", "200");
      break;
    case "200plus":
      params.set("min_price", "200");
      params.delete("max_price");
      break;
    default:
      break;
  }
}

function lumensTierFromParams(minL: string | null, maxL: string | null): LumensTier {
  const lo = minL != null && minL !== "" ? Number(minL) : undefined;
  const hi = maxL != null && maxL !== "" ? Number(maxL) : undefined;
  if (lo === 10000 && hi === undefined) return "10000plus";
  if (lo === undefined && hi === 500) return "500";
  if (lo === undefined && hi === 1000) return "1000";
  if (lo === undefined && hi === 2000) return "2000";
  if (lo === undefined && hi === 3000) return "3000";
  if (lo === undefined && hi === 5000) return "5000";
  if (lo === undefined && hi === 10000) return "10000";
  return "";
}

function applyLumensTier(p: URLSearchParams, tier: LumensTier) {
  p.delete("min_lumens");
  p.delete("max_lumens");
  switch (tier) {
    case "500": p.set("max_lumens", "500"); break;
    case "1000": p.set("max_lumens", "1000"); break;
    case "2000": p.set("max_lumens", "2000"); break;
    case "3000": p.set("max_lumens", "3000"); break;
    case "5000": p.set("max_lumens", "5000"); break;
    case "10000": p.set("max_lumens", "10000"); break;
    case "10000plus": p.set("min_lumens", "10000"); break;
  }
}

function throwTierFromParams(minT: string | null, maxT: string | null): ThrowTier {
  const lo = minT != null && minT !== "" ? Number(minT) : undefined;
  const hi = maxT != null && maxT !== "" ? Number(maxT) : undefined;
  if (lo === 500 && hi === undefined) return "500plus";
  if (lo === undefined && hi === 100) return "100";
  if (lo === undefined && hi === 200) return "200";
  if (lo === undefined && hi === 300) return "300";
  if (lo === undefined && hi === 500) return "500";
  return "";
}

function applyThrowTier(p: URLSearchParams, tier: ThrowTier) {
  p.delete("min_throw");
  p.delete("max_throw");
  switch (tier) {
    case "100": p.set("max_throw", "100"); break;
    case "200": p.set("max_throw", "200"); break;
    case "300": p.set("max_throw", "300"); break;
    case "500": p.set("max_throw", "500"); break;
    case "500plus": p.set("min_throw", "500"); break;
  }
}

export function SpecBar({ brands }: { brands: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [brandExpanded, setBrandExpanded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const q = next.toString();
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const currentUseCase = searchParams.get("use_case") || "";
  const selectedBatteries = useMemo(
    () => (searchParams.get("battery_type") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [searchParams]
  );
  const selectedBrands = useMemo(
    () => (searchParams.get("brand") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [searchParams]
  );

  const lumensTier = lumensTierFromParams(
    searchParams.get("min_lumens"),
    searchParams.get("max_lumens")
  );
  const throwTier = throwTierFromParams(
    searchParams.get("min_throw"),
    searchParams.get("max_throw")
  );
  const priceTier = priceTierFromParams(
    searchParams.get("min_price"),
    searchParams.get("max_price")
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (currentUseCase) n++;
    if (lumensTier !== "") n++;
    if (throwTier !== "") n++;
    n += selectedBatteries.length;
    if (priceTier !== "") n++;
    n += selectedBrands.length;
    return n;
  }, [
    currentUseCase,
    lumensTier,
    throwTier,
    selectedBatteries.length,
    priceTier,
    selectedBrands.length,
  ]);

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
    setIsDrawerOpen(false);
  }, [router, pathname]);

  const setUseCase = (value: string) => {
    pushParams((p) => {
      if (!value) p.delete("use_case");
      else p.set("use_case", value);
    });
  };

  const setPriceTier = (tier: PriceTier) => {
    pushParams((p) => applyPriceTier(p, tier));
  };

  const toggleBattery = (code: string) => {
    pushParams((p) => {
      const cur = new Set(
        (p.get("battery_type") || "").split(",").map((s) => s.trim()).filter(Boolean)
      );
      if (cur.has(code)) cur.delete(code);
      else cur.add(code);
      if (cur.size === 0) p.delete("battery_type");
      else p.set("battery_type", Array.from(cur).join(","));
    });
  };

  const toggleBrand = (brand: string) => {
    pushParams((p) => {
      const cur = new Set(
        (p.get("brand") || "").split(",").map((s) => s.trim()).filter(Boolean)
      );
      if (cur.has(brand)) cur.delete(brand);
      else cur.add(brand);
      if (cur.size === 0) p.delete("brand");
      else p.set("brand", Array.from(cur).join(","));
    });
  };

  const setLumensTier = (tier: LumensTier) => {
    pushParams((p) => applyLumensTier(p, tier));
  };

  const setThrowTier = (tier: ThrowTier) => {
    pushParams((p) => applyThrowTier(p, tier));
  };

  const visibleBrands = brandExpanded ? brands : brands.slice(0, 20);

  return (
    <div className="spec-bar-wrap">
      <button
        type="button"
        className="spec-bar-toggle"
        aria-expanded={isDrawerOpen}
        onClick={() => setIsDrawerOpen((o) => !o)}
      >
        Filters
        {activeFilterCount > 0 && (
          <span className="spec-bar-toggle-badge">{activeFilterCount}</span>
        )}
      </button>

      <div
        className={`spec-bar-backdrop${isDrawerOpen ? " spec-bar-backdrop--open" : ""}`}
        aria-hidden
        onClick={() => setIsDrawerOpen(false)}
      />

      <aside
        className={`spec-bar${isDrawerOpen ? " spec-bar-open" : ""}`}
        aria-label="Filter flashlights by specifications"
      >
        <div className="spec-bar-section">
          <label htmlFor="spec-use-case" className="spec-bar-label">
            Use Case
          </label>
          <select
            id="spec-use-case"
            className="filter-select spec-bar-select"
            value={currentUseCase}
            onChange={(e) => setUseCase(e.target.value)}
          >
            <option value="">Any Use Case</option>
            {USE_CASES.map((uc) => (
              <option key={uc.value} value={uc.value}>
                {uc.label}
              </option>
            ))}
          </select>
        </div>

        <div className="spec-bar-section">
          <label htmlFor="spec-price" className="spec-bar-label">
            Price Range
          </label>
          <select
            id="spec-price"
            className="filter-select spec-bar-select"
            value={priceTier}
            onChange={(e) => setPriceTier(e.target.value as PriceTier)}
          >
            <option value="">Any</option>
            <option value="25">Under $25</option>
            <option value="50">Under $50</option>
            <option value="100">Under $100</option>
            <option value="200">Under $200</option>
            <option value="200plus">$200+</option>
          </select>
        </div>

        <div className="spec-bar-section">
          <label htmlFor="spec-lumens" className="spec-bar-label">
            Lumens
          </label>
          <select
            id="spec-lumens"
            className="filter-select spec-bar-select"
            value={lumensTier}
            onChange={(e) => setLumensTier(e.target.value as LumensTier)}
          >
            <option value="">Any</option>
            <option value="500">Up to 500 lm</option>
            <option value="1000">Up to 1,000 lm</option>
            <option value="2000">Up to 2,000 lm</option>
            <option value="3000">Up to 3,000 lm</option>
            <option value="5000">Up to 5,000 lm</option>
            <option value="10000">Up to 10,000 lm</option>
            <option value="10000plus">10,000+ lm</option>
          </select>
        </div>

        <div className="spec-bar-section">
          <label htmlFor="spec-throw" className="spec-bar-label">
            Throw Distance
          </label>
          <select
            id="spec-throw"
            className="filter-select spec-bar-select"
            value={throwTier}
            onChange={(e) => setThrowTier(e.target.value as ThrowTier)}
          >
            <option value="">Any</option>
            <option value="100">Up to 100m</option>
            <option value="200">Up to 200m</option>
            <option value="300">Up to 300m</option>
            <option value="500">Up to 500m</option>
            <option value="500plus">500m+</option>
          </select>
        </div>

        <div className="spec-bar-section">
          <div className="spec-bar-label">Battery Type</div>
          <ul className="spec-bar-check-list">
            {BATTERY_TYPES.map((bt) => (
              <li key={bt.value}>
                <label
                  className={`brand-check spec-bar-battery-check${
                    selectedBatteries.includes(bt.value) ? " active" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedBatteries.includes(bt.value)}
                    onChange={() => toggleBattery(bt.value)}
                  />
                  {bt.label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        {brands.length > 0 && (
          <div className="spec-bar-section spec-bar-section--brands">
            <h4 className="spec-bar-label spec-bar-brand-heading">
              Brand
              {selectedBrands.length > 0 && (
                <span className="brand-count">{selectedBrands.length}</span>
              )}
            </h4>
            <ul className="brand-list spec-bar-brand-list">
              {visibleBrands.map((b) => (
                <li key={b}>
                  <label
                    className={`brand-check${
                      selectedBrands.includes(b) ? " active" : ""
                    }`}
                  >
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
                type="button"
                className="brand-show-more"
                onClick={() => setBrandExpanded((e) => !e)}
              >
                {brandExpanded ? "Show fewer" : `Show all ${brands.length}`}
              </button>
            )}
          </div>
        )}

        <div className="spec-bar-section spec-bar-section--footer">
          <button type="button" className="btn-clear spec-bar-clear" onClick={clearAll}>
            Clear All Filters
          </button>
        </div>
      </aside>
    </div>
  );
}
