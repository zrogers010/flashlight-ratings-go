import Link from "next/link";
import { AmazonCTA } from "@/components/AmazonCTA";
import { fetchFlashlights } from "@/lib/api";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export default async function FlashlightsPage() {
  const data = await fetchFlashlights();

  return (
    <section className="grid">
      <div className="panel">
        <p className="kicker">Catalog</p>
        <h1>Flashlight Listings</h1>
        <p className="muted">Images, prices, specs, and quick links to full technical details.</p>
      </div>

      <div className="card-grid">
        {data.items.map((item) => (
          <article key={item.id} className="panel product-card">
            <div className="image-card">
              {item.image_url ? (
                <img src={item.image_url} alt={`${item.brand} ${item.name}`} loading="lazy" />
              ) : (
                <div className="image-fallback">No image</div>
              )}
            </div>
            <p className="kicker">{item.brand}</p>
            <h3>
              {item.name} {item.model_code ? <span className="muted">{item.model_code}</span> : null}
            </h3>
            <p className="muted clamp-3">{item.description || "Description coming soon."}</p>
            <div className="spec-row">
              <span>{fmt(item.max_lumens)} lm</span>
              <span>{fmt(item.beam_distance_m)} m throw</span>
              <span>{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "N/A"}</span>
            </div>
            <div className="cta-row">
              <Link href={`/flashlights/${item.id}`} className="button-link button-secondary">
                Full Details
              </Link>
              <AmazonCTA href={item.amazon_url} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
