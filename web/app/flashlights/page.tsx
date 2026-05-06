import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { SpecBar, SortDropdown } from "@/components/FacetedSearch";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { ItemListStructuredData, BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchFlashlights, fetchBrands } from "@/lib/api";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All Flashlights — Full Catalog with Specs & Prices",
  description:
    "Browse every flashlight in our catalog. Filter by use case, battery type, price, and brand. Specs, scores, and current Amazon pricing for each model.",
  alternates: { canonical: "/flashlights" }
};

type CatalogSearchParams = {
  use_case?: string;
  battery_type?: string;
  brand?: string;
  min_price?: string;
  max_price?: string;
  min_lumens?: string;
  max_lumens?: string;
  min_throw?: string;
  max_throw?: string;
  sort_by?: string;
  order?: string;
};

const CATALOG_QUERY_KEYS: (keyof CatalogSearchParams)[] = [
  "use_case",
  "battery_type",
  "brand",
  "min_price",
  "max_price",
  "min_lumens",
  "max_lumens",
  "min_throw",
  "max_throw",
  "sort_by",
  "order"
];

const USE_CASE_LABELS: Record<string, string> = {
  edc: "Everyday Carry",
  tactical: "Tactical",
  camping: "Camping & Outdoors",
  "search-rescue": "Search & Rescue",
  survival: "Survival",
  diving: "Diving & Maritime",
  "weapon-mount": "Weapon Mount",
  keychain: "Keychain",
};

function parseQueryInt(s?: string): number | undefined {
  if (s === undefined || s === "") return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function catalogHref(sp: CatalogSearchParams): string {
  const p = new URLSearchParams();
  for (const k of CATALOG_QUERY_KEYS) {
    const v = sp[k];
    if (v) p.set(k, v);
  }
  const q = p.toString();
  return q ? `/flashlights?${q}` : "/flashlights";
}

function buildActiveFilterChips(sp: CatalogSearchParams): { label: string; href: string }[] {
  const chips: { label: string; href: string }[] = [];

  if (sp.use_case) {
    chips.push({
      label: `Use: ${USE_CASE_LABELS[sp.use_case] ?? sp.use_case}`,
      href: catalogHref({ ...sp, use_case: undefined })
    });
  }

  const batteries = (sp.battery_type || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const b of batteries) {
    const rest: CatalogSearchParams = { ...sp };
    const next = batteries.filter((x) => x !== b);
    rest.battery_type = next.length ? next.join(",") : undefined;
    chips.push({ label: `Battery: ${b}`, href: catalogHref(rest) });
  }

  const brands = (sp.brand || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const br of brands) {
    const rest: CatalogSearchParams = { ...sp };
    const next = brands.filter((x) => x !== br);
    rest.brand = next.length ? next.join(",") : undefined;
    chips.push({ label: `Brand: ${br}`, href: catalogHref(rest) });
  }

  if (sp.min_price || sp.max_price) {
    let label = "Price";
    if (sp.min_price && sp.max_price) {
      label = `Price: $${sp.min_price}–$${sp.max_price}`;
    } else if (sp.max_price) {
      label = `Price: under $${sp.max_price}`;
    } else if (sp.min_price) {
      label = `Price: $${sp.min_price}+`;
    }
    chips.push({
      label,
      href: catalogHref({ ...sp, min_price: undefined, max_price: undefined })
    });
  }

  if (sp.min_lumens || sp.max_lumens) {
    const minL = parseQueryInt(sp.min_lumens);
    const maxL = parseQueryInt(sp.max_lumens);
    let label = "Lumens";
    if (minL !== undefined && maxL !== undefined) {
      label = `Lumens: ${minL.toLocaleString()}–${maxL.toLocaleString()}`;
    } else if (minL !== undefined) {
      label = `Lumens: ≥${minL.toLocaleString()}`;
    } else if (maxL !== undefined) {
      label = `Lumens: ≤${maxL.toLocaleString()}`;
    }
    chips.push({
      label,
      href: catalogHref({ ...sp, min_lumens: undefined, max_lumens: undefined })
    });
  }

  if (sp.min_throw || sp.max_throw) {
    const minT = parseQueryInt(sp.min_throw);
    const maxT = parseQueryInt(sp.max_throw);
    let label = "Throw";
    if (minT !== undefined && maxT !== undefined) {
      label = `Throw: ${minT.toLocaleString()}–${maxT.toLocaleString()} m`;
    } else if (minT !== undefined) {
      label = `Throw: ≥${minT.toLocaleString()} m`;
    } else if (maxT !== undefined) {
      label = `Throw: ≤${maxT.toLocaleString()} m`;
    }
    chips.push({
      label,
      href: catalogHref({ ...sp, min_throw: undefined, max_throw: undefined })
    });
  }

  return chips;
}

export default async function FlashlightsPage({
  searchParams
}: {
  searchParams?: CatalogSearchParams;
}) {
  const sp: CatalogSearchParams = searchParams ?? {};

  const [data, brands] = await Promise.all([
    fetchFlashlights({
      useCase: sp.use_case,
      batteryType: sp.battery_type,
      brand: sp.brand,
      minPrice: sp.min_price ? Number(sp.min_price) : undefined,
      maxPrice: sp.max_price ? Number(sp.max_price) : undefined,
      minLumens: parseQueryInt(sp.min_lumens),
      maxLumens: parseQueryInt(sp.max_lumens),
      minThrow: parseQueryInt(sp.min_throw),
      maxThrow: parseQueryInt(sp.max_throw),
      sortBy: sp.sort_by,
      order: sp.order
    }),
    fetchBrands()
  ]);

  const hasFilters = Boolean(
    sp.use_case ||
      sp.battery_type ||
      sp.brand ||
      sp.min_price ||
      sp.max_price ||
      sp.min_lumens ||
      sp.max_lumens ||
      sp.min_throw ||
      sp.max_throw
  );

  const filterChips = buildActiveFilterChips(sp);

  return (
    <section className="grid">
      <BreadcrumbStructuredData items={[{ name: "Catalog" }]} />
      <ItemListStructuredData
        name="All Flashlights"
        items={data.items.slice(0, 10).map((item, i) => ({
          position: i + 1,
          name: `${item.brand} ${item.name}`,
          url: item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`,
          image: item.image_url,
          price: item.price_usd,
        }))}
      />
      <Breadcrumbs items={[{ label: "Catalog" }]} />

      <div className="panel hero">
        <p className="kicker">Full Catalog</p>
        <h1>All Flashlights</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          {data.total} models with verified specs, algorithmic scores, and real-time Amazon pricing.
          {hasFilters && " Showing filtered results."}
        </p>
      </div>

      <div className="catalog-grid-layout">
        <Suspense>
          <SpecBar brands={brands} />
        </Suspense>

        <div>
          <div className="catalog-toolbar">
            {filterChips.length > 0 && (
              <div className="filter-chips" aria-label="Active filters">
                {filterChips.map((chip) => (
                  <Link
                    key={chip.href}
                    href={chip.href}
                    className="filter-chip"
                    scroll={false}
                    aria-label={`Remove filter: ${chip.label}`}
                  >
                    <span>{chip.label}</span>
                    <span className="filter-chip-remove" aria-hidden>
                      ×
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Suspense>
              <SortDropdown />
            </Suspense>
          </div>

          <div className="card-grid">
            {data.items.map((item) => (
              <FlashlightCard key={item.id} item={item} />
            ))}
          </div>

          {data.items.length === 0 && (
            <div className="panel" style={{ textAlign: "center", padding: 40 }}>
              <p className="muted">No flashlights match your filters. Try adjusting or clearing them.</p>
            </div>
          )}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
