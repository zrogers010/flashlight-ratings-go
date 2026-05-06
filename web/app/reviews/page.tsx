import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { BreadcrumbStructuredData, ItemListStructuredData } from "@/components/StructuredData";
import { fetchFlashlights } from "@/lib/api";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Flashlight Breakdowns — Data-Driven Analysis for Every Model",
  description:
    "In-depth, data-driven breakdown articles for every flashlight in our database. Scores, specs, use-case analysis, and comparisons — no guesswork.",
  alternates: { canonical: "/reviews" },
};

function topScore(item: { overall_score?: number; tactical_score?: number; edc_score?: number; value_score?: number; throw_score?: number; flood_score?: number }) {
  return Math.max(
    item.overall_score || 0,
    item.tactical_score || 0,
    item.edc_score || 0,
    item.value_score || 0,
    item.throw_score || 0,
    item.flood_score || 0
  );
}

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default async function ReviewsIndexPage() {
  const catalog = await fetchFlashlights({
    pageSize: 200,
    sortBy: "overall_score",
    order: "desc",
  }).catch(() => ({
    page: 1,
    page_size: 0,
    total: 0,
    total_pages: 0,
    items: [] as never[],
  }));
  const items = catalog.items;

  return (
    <section className="grid">
      <BreadcrumbStructuredData items={[{ name: "Reviews" }]} />
      <ItemListStructuredData
        name="Flashlight Breakdowns"
        items={items.slice(0, 20).map((item, i) => ({
          position: i + 1,
          name: `${item.brand} ${item.name}`,
          url: `/reviews/${item.slug}`,
          image: item.image_url,
          price: item.price_usd,
        }))}
      />

      <Breadcrumbs items={[{ label: "Reviews" }]} />

      <div className="panel hero">
        <p className="kicker">Data-Driven Analysis</p>
        <h1>Flashlight Breakdowns</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          Every flashlight in our database gets a detailed breakdown article:
          algorithmic scores, spec analysis, use-case recommendations, and
          competitor comparisons. No fluff, no fake reviews — just data.
        </p>
      </div>

      <div className="review-index-grid">
        {items.map((item) => {
          const score = topScore(item);
          return (
            <Link
              key={item.id}
              href={`/reviews/${item.slug}`}
              className="review-index-card"
            >
              <div className="review-index-image">
                {item.image_url ? (
                  <ImageWithFallback
                    src={item.image_url}
                    alt={`${item.brand} ${item.name}`}
                    loading="lazy"
                  />
                ) : (
                  <div className="review-index-placeholder">◉</div>
                )}
              </div>
              <div className="review-index-body">
                <p className="review-index-brand">{item.brand}</p>
                <h3 className="review-index-name">{item.name}</h3>
                <div className="review-index-specs">
                  <span>{fmt(item.max_lumens)} lm</span>
                  <span>{fmt(item.beam_distance_m)}m</span>
                  {item.price_usd ? (
                    <span>${fmt(item.price_usd, 2)}</span>
                  ) : null}
                </div>
              </div>
              <div className="review-index-score">
                {score > 0 && <ScoreBadge score={score} size="sm" />}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
