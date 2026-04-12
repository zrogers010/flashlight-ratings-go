import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchBrandsDetailed } from "@/lib/api";

export const dynamic = "force-dynamic";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  CA: "Canada",
  JP: "Japan",
  DE: "Germany",
  UK: "United Kingdom",
};

export const metadata: Metadata = {
  title: "Flashlight Brands — All Manufacturers with Ratings & Reviews",
  description:
    "Browse flashlight brands from around the world. See every manufacturer we rate, with product counts, country of origin, and links to their full catalogs.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = await fetchBrandsDetailed();

  return (
    <section className="grid">
      <BreadcrumbStructuredData items={[{ name: "Brands" }]} />
      <Breadcrumbs items={[{ label: "Brands" }]} />

      <div className="panel hero">
        <p className="kicker">All Brands</p>
        <h1>Flashlight Manufacturers</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          {brands.length} brands with {brands.reduce((s, b) => s + b.product_count, 0)} rated
          flashlights. Select a brand to see all their models with scores and pricing.
        </p>
      </div>

      <div className="brand-grid">
        {brands.map((brand) => (
          <Link
            key={brand.slug}
            href={`/brands/${brand.slug}`}
            className="brand-card"
          >
            <h2 className="brand-card-name">{brand.name}</h2>
            <div className="brand-card-meta">
              {brand.country_code && (
                <span className="badge badge-teal">
                  {COUNTRY_NAMES[brand.country_code] || brand.country_code}
                </span>
              )}
              <span className="muted">
                {brand.product_count} {brand.product_count === 1 ? "model" : "models"}
              </span>
            </div>
            {brand.website_url && (
              <span className="muted brand-card-url">
                {new URL(brand.website_url).hostname.replace("www.", "")}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
