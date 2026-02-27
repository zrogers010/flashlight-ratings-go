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

const guides = [
  {
    title: "How To Pick Throw vs Flood",
    body: "Use candela and beam distance for long-range spotting, and lumens + beam profile for close-range task light."
  },
  {
    title: "Runtime Numbers Explained",
    body: "Manufacturer runtime is often step-down based. Compare low/medium/high tables to estimate real-world sustained use."
  },
  {
    title: "Best EDC Weight Range",
    body: "Most people find 60g-110g ideal for pocket carry. Above that, clip quality and body shape become critical."
  }
];

const faq = [
  {
    q: "How often are rankings updated?",
    a: "The worker reruns sync and scoring on a schedule, then pages show the latest completed scoring batch."
  },
  {
    q: "Do prices update in real time?",
    a: "Prices reflect the most recent snapshot available in the database and may lag the live Amazon listing."
  },
  {
    q: "Are affiliate links disclosed?",
    a: "Yes. Every page with purchase links includes the affiliate disclosure."
  }
];

export default async function HomePage() {
  const [rankings, flashlights] = await Promise.all([fetchRankings("tactical"), fetchFlashlights()]);
  const top = rankings.items.slice(0, 3);
  const featured = flashlights.items.slice(0, 6);
  const latest = [...flashlights.items]
    .sort((a, b) => (b.price_usd || 0) - (a.price_usd || 0))
    .slice(0, 3);

  return (
    <section className="grid">
      <div className="panel hero">
        <p className="kicker">Field-Tested Picks</p>
        <h1>Find The Right Flashlight Fast</h1>
        <p className="muted">
          Browse verified specs, ranked recommendations, runtime tables, and direct links to in-stock products.
        </p>
        <div className="cta-row">
          <Link href="/rankings" className="button-link">
            View Rankings
          </Link>
          <Link href="/flashlights" className="button-link button-secondary">
            Browse Catalog
          </Link>
          <Link href="/compare?ids=1,2" className="button-link button-secondary">
            Compare Models
          </Link>
        </div>
      </div>

      <div className="panel stat-grid">
        <div className="stat-card">
          <p className="kicker">Catalog Size</p>
          <h3>{flashlights.total}</h3>
          <p className="muted">models indexed</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Top Tactical</p>
          <h3>{top[0] ? `${top[0].score.toFixed(1)}` : "N/A"}</h3>
          <p className="muted">current leading score</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Price Range</p>
          <h3>
            $
            {flashlights.items.length
              ? Math.min(...flashlights.items.map((x) => x.price_usd || 9999)).toFixed(0)
              : "N/A"}
            +
          </h3>
          <p className="muted">starting point in catalog</p>
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
              <p className="kicker">{item.brand}</p>
              <h3>
                <Link href={`/flashlights/${item.id}`}>
                  {item.name} {item.model_code ? <span className="muted">{item.model_code}</span> : null}
                </Link>
              </h3>
              <p className="muted clamp-3">{item.description || "Description coming soon."}</p>
              <div className="spec-row">
                <span>{fmt(item.max_lumens)} lm</span>
                <span>{fmt(item.beam_distance_m)} m throw</span>
                <span>{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "N/A"}</span>
              </div>
              <div className="cta-row">
                <Link href={`/flashlights/${item.id}`} className="button-link button-secondary">
                  Details
                </Link>
                <AmazonCTA href={item.amazon_url} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Buying Guides</h2>
        <div className="guide-grid">
          {guides.map((g) => (
            <article key={g.title} className="guide-card">
              <h3>{g.title}</h3>
              <p className="muted">{g.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Price Watch</h2>
        <div className="card-grid">
          {latest.map((item) => (
            <article key={`price-${item.id}`} className="product-card">
              <h3>
                <Link href={`/flashlights/${item.id}`}>
                  {item.brand} {item.name}
                </Link>
              </h3>
              <p className="muted">{item.description || "See full detail page for full specification profile."}</p>
              <p className="price-line">{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "N/A"}</p>
              <AmazonCTA href={item.amazon_url} />
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

      <div className="panel">
        <h2>FAQ</h2>
        <div className="faq-grid">
          {faq.map((item) => (
            <article key={item.q} className="faq-card">
              <h3>{item.q}</h3>
              <p className="muted">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
