import Link from "next/link";
import { AmazonCTA } from "@/components/AmazonCTA";
import { fetchFlashlights, fetchRankings } from "@/lib/api";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

const reviews = [
  {
    quote: "Rankings helped me narrow from 20 models to 2 serious options in minutes.",
    author: "Dylan, Search & Rescue Volunteer"
  },
  {
    quote: "The side-by-side compare view made battery and throw differences obvious.",
    author: "Mina, Everyday Carry Enthusiast"
  },
  {
    quote: "Finally a flashlight site that shows both raw specs and practical value scoring.",
    author: "Carlos, Gear Reviewer"
  }
];

export default async function HomePage() {
  const [rankings, flashlights] = await Promise.all([fetchRankings("tactical"), fetchFlashlights()]);
  const top = rankings.items.slice(0, 3);
  const featured = flashlights.items.slice(0, 4);

  return (
    <section className="grid">
      <div className="panel hero">
        <p className="kicker">Field-Tested Picks</p>
        <h1>Find The Right Flashlight Fast</h1>
        <p className="muted">
          Explore ranked models with specs, prices, and affiliate links. Compare output, throw, runtime, and carry
          features in one place.
        </p>
        <div className="cta-row">
          <Link href="/rankings" className="button-link">
            View Rankings
          </Link>
          <Link href="/flashlights" className="button-link button-secondary">
            Browse Catalog
          </Link>
        </div>
      </div>

      <div className="panel">
        <h2>Top Tactical Right Now</h2>
        <div className="card-grid">
          {top.map((item) => (
            <article key={item.flashlight.id} className="product-card">
              <div className="image-card">
                {item.flashlight.image_url ? (
                  <img src={item.flashlight.image_url} alt={item.flashlight.name} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>
              <p className="kicker">Rank #{item.rank}</p>
              <h3>
                <Link href={`/flashlights/${item.flashlight.id}`}>
                  {item.flashlight.brand} {item.flashlight.name}
                </Link>
              </h3>
              <p className="muted">Score: {fmt(item.score, 2)}</p>
              <AmazonCTA href={item.flashlight.amazon_url} />
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Featured Models</h2>
        <div className="card-grid">
          {featured.map((item) => (
            <article key={item.id} className="product-card">
              <div className="image-card">
                {item.image_url ? (
                  <img src={item.image_url} alt={`${item.brand} ${item.name}`} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>
              <h3>
                <Link href={`/flashlights/${item.id}`}>
                  {item.brand} {item.name}
                </Link>
              </h3>
              <p className="muted clamp-3">{item.description || "Description coming soon."}</p>
              <div className="spec-row">
                <span>{fmt(item.max_lumens)} lm</span>
                <span>{fmt(item.beam_distance_m)} m</span>
                <span>{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "N/A"}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Recent User Reviews</h2>
        <div className="review-grid">
          {reviews.map((r) => (
            <blockquote key={r.author} className="review-card">
              <p>"{r.quote}"</p>
              <cite>{r.author}</cite>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
