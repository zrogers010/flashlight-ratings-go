import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import {
  BreadcrumbStructuredData,
  ItemListStructuredData,
} from "@/components/StructuredData";
import { fetchBrandBySlug, fetchBrandsDetailed } from "@/lib/api";

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const brands = await fetchBrandsDetailed();
    return brands.map((b) => ({ slug: b.slug }));
  } catch {
    return [];
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  CA: "Canada",
  JP: "Japan",
  DE: "Germany",
  UK: "United Kingdom",
};

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const brand = await fetchBrandBySlug(params.slug);
  return {
    title: `${brand.name} Flashlights — All ${brand.product_count} Models Rated & Reviewed`,
    description: `Browse all ${brand.product_count} ${brand.name} flashlights with algorithmic scores, verified specs, and real-time Amazon pricing. Find the best ${brand.name} flashlight for your needs.`,
    alternates: { canonical: `/brands/${params.slug}` },
  };
}

export default async function BrandDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const brand = await fetchBrandBySlug(params.slug);
  const country = brand.country_code
    ? COUNTRY_NAMES[brand.country_code] || brand.country_code
    : null;

  return (
    <section className="grid">
      <BreadcrumbStructuredData
        items={[
          { name: "Brands", href: "/brands" },
          { name: brand.name },
        ]}
      />
      <ItemListStructuredData
        name={`${brand.name} Flashlights`}
        items={brand.products.slice(0, 10).map((item, i) => ({
          position: i + 1,
          name: `${item.brand} ${item.name}`,
          url: item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`,
          image: item.image_url,
          price: item.price_usd,
        }))}
      />

      <Breadcrumbs
        items={[
          { label: "Brands", href: "/brands" },
          { label: brand.name },
        ]}
      />

      <div className="panel hero">
        <p className="kicker">Brand</p>
        <h1>{brand.name} Flashlights</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          {brand.product_count} {brand.name} models with verified specs,
          algorithmic scores, and real-time Amazon pricing.
        </p>
        <div className="spec-row" style={{ marginTop: 12 }}>
          {country && <span className="badge badge-teal">{country}</span>}
          {brand.website_url && (
            <a
              href={brand.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-external-link"
            >
              Official Website ↗
            </a>
          )}
        </div>
      </div>

      <div className="card-grid">
        {brand.products.map((item) => (
          <FlashlightCard key={item.id} item={item} />
        ))}
      </div>

      {brand.products.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">
            No flashlights found for this brand.
          </p>
        </div>
      )}

      <AmazonDisclosure />
    </section>
  );
}
