import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { FacetedSearch } from "@/components/FacetedSearch";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights, fetchBrands } from "@/lib/api";

export const metadata: Metadata = {
  title: "All Flashlights — Full Catalog with Specs & Prices",
  description:
    "Browse every flashlight in our catalog. Filter by use case, battery type, price, and brand. Specs, scores, and current Amazon pricing for each model."
};

export default async function FlashlightsPage({
  searchParams,
}: {
  searchParams?: {
    use_case?: string;
    battery_type?: string;
    brand?: string;
    min_price?: string;
    max_price?: string;
    sort_by?: string;
    order?: string;
  };
}) {
  const [data, brands] = await Promise.all([
    fetchFlashlights({
      useCase: searchParams?.use_case,
      batteryType: searchParams?.battery_type,
      brand: searchParams?.brand,
      minPrice: searchParams?.min_price ? Number(searchParams.min_price) : undefined,
      maxPrice: searchParams?.max_price ? Number(searchParams.max_price) : undefined,
      sortBy: searchParams?.sort_by,
      order: searchParams?.order,
    }),
    fetchBrands(),
  ]);

  const hasFilters = searchParams?.use_case || searchParams?.battery_type || searchParams?.brand || searchParams?.min_price || searchParams?.max_price;

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Catalog" }]} />

      <div className="panel hero">
        <p className="kicker">Full Catalog</p>
        <h1>All Flashlights</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          {data.total} models with verified specs, algorithmic scores, and real-time Amazon pricing.
          {hasFilters && " Showing filtered results."}
        </p>
      </div>

      <div className="catalog-layout">
        <Suspense>
          <FacetedSearch brands={brands} />
        </Suspense>

        <div>
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
