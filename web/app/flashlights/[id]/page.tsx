import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { fetchFlashlightByID, fetchFlashlights } from "@/lib/api";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function yesNo(v?: boolean) {
  if (v === undefined) return "N/A";
  return v ? "Yes" : "No";
}

function bestForLabel(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const picks = [
    { label: "Tactical", value: data.tactical_score || 0 },
    { label: "EDC / Everyday Carry", value: data.edc_score || 0 },
    { label: "Value Buyers", value: data.value_score || 0 },
    { label: "Long-Range Throw", value: data.throw_score || 0 },
    { label: "Wide Flood Beam", value: data.flood_score || 0 }
  ];
  picks.sort((a, b) => b.value - a.value);
  return picks[0]?.label || "General Use";
}

function toDate(v?: string) {
  if (!v) return "N/A";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString();
}

function pros(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const out: string[] = [];
  if ((data.max_candela || 0) >= 40000) out.push("Strong throw performance for long-range visibility");
  if ((data.runtime_medium_min || 0) >= 240) out.push("Solid medium-mode runtime for practical use");
  if (data.usb_c_rechargeable) out.push("Convenient direct USB-C charging");
  if (data.waterproof_rating === "IPX8" || data.waterproof_rating === "IP68")
    out.push("High waterproof rating for rough weather");
  if ((data.value_score || 0) >= 85) out.push("Strong performance-per-dollar value score");
  return out.slice(0, 4);
}

function cons(data: Awaited<ReturnType<typeof fetchFlashlightByID>>) {
  const out: string[] = [];
  if ((data.weight_g || 0) > 120) out.push("Heavier than typical pocket EDC options");
  if (!data.has_lockout) out.push("No lockout feature listed");
  if (!data.has_pocket_clip) out.push("No pocket clip listed");
  if ((data.runtime_high_min || 0) > 0 && (data.runtime_high_min || 0) < 70)
    out.push("High-mode runtime is limited");
  return out.slice(0, 4);
}

export default async function FlashlightDetailPage({
  params
}: {
  params: { id: string };
}) {
  const [data, catalog] = await Promise.all([fetchFlashlightByID(params.id), fetchFlashlights()]);
  const images = data.image_urls?.length ? data.image_urls : data.image_url ? [data.image_url] : [];
  const alternatives = catalog.items
    .filter((x) => x.id !== data.id)
    .sort((a, b) => Math.abs((a.price_usd || 0) - (data.price_usd || 0)) - Math.abs((b.price_usd || 0) - (data.price_usd || 0)))
    .slice(0, 3);

  const positive = pros(data);
  const drawbacks = cons(data);

  return (
    <section className="grid">
      <div className="panel hero detail-hero">
        <div className="detail-hero-main">
          <p className="kicker">{data.brand}</p>
          <h1>
            {data.name} {data.model_code ? <span className="muted">{data.model_code}</span> : null}
          </h1>
          <p className="muted">{data.description || "No description available yet."}</p>
          <div className="spec-row">
            <span>Best For: {bestForLabel(data)}</span>
            <span>{fmt(data.max_lumens)} lm</span>
            <span>{fmt(data.beam_distance_m)} m throw</span>
            <span>{data.waterproof_rating || "N/A"}</span>
          </div>
        </div>
        <aside className="panel buy-box">
          <p className="kicker">Buy Confidence</p>
          <p className="price-line">{data.price_usd !== undefined ? `$${fmt(data.price_usd, 2)}` : "Price unavailable"}</p>
          <AmazonCTA href={data.amazon_url} />
          <p className="muted small">Price updated: {toDate(data.price_last_updated_at)}</p>
          <p className="muted small">
            Amazon rating:{" "}
            {data.amazon_average_rating !== undefined
              ? `${fmt(data.amazon_average_rating, 1)} / 5 (${fmt(data.amazon_rating_count)} ratings)`
              : "N/A"}
          </p>
          <p className="muted small">Last Amazon sync: {toDate(data.amazon_last_synced_at)}</p>
          <Link href={`/compare?ids=${data.id}${alternatives[0] ? `,${alternatives[0].id}` : ""}`} className="button-link button-secondary">
            Compare Against Another
          </Link>
        </aside>
      </div>

      {images.length > 0 && (
        <div className="image-strip">
          {images.map((src, idx) => (
            <div key={`${src}-${idx}`} className="image-card">
              <img src={src} alt={`${data.name} image ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-3">
        <div className="panel">
          <h3>Identity</h3>
          <p>Brand: {data.brand}</p>
          <p>Model: {data.name}</p>
          <p>Release Year: {fmt(data.release_year)}</p>
          <p>MSRP: {data.msrp_usd !== undefined ? `$${fmt(data.msrp_usd, 2)}` : "N/A"}</p>
          <p>Current Amazon Price: {data.price_usd !== undefined ? `$${fmt(data.price_usd, 2)}` : "N/A"}</p>
          <p>Amazon Rating Count: {fmt(data.amazon_rating_count)}</p>
          <p>ASIN: {data.asin || "N/A"}</p>
          <h3>Use Case Tags</h3>
          <div className="spec-row">
            {(data.use_case_tags && data.use_case_tags.length > 0
              ? data.use_case_tags
              : ["edc", "tactical", "law-enforcement", "camping", "search-rescue", "weapon-mount", "keychain"]
            ).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Performance</h3>
          <p>Max Lumens: {fmt(data.max_lumens)}</p>
          <p>Sustained Lumens: {fmt(data.sustained_lumens)}</p>
          <p>Candela: {fmt(data.max_candela)}</p>
          <p>Beam Distance (m): {fmt(data.beam_distance_m)}</p>
          <p>Runtime At Max: {fmt(data.runtime_turbo_min)} min</p>
          <p>Runtime At 500 Lumens: {fmt(data.runtime_500_min)} min</p>
          <p>Beam Pattern: {data.beam_pattern || "N/A"}</p>
          <p>Turbo Step-Down Time: {fmt(data.turbo_stepdown_sec)} sec</p>
        </div>

        <div className="panel">
          <h3>Hardware</h3>
          <p>Battery Type: {data.battery_types?.length ? data.battery_types.join(", ") : "N/A"}</p>
          <p>Recharge Type: {data.recharge_type || (data.usb_c_rechargeable ? "usb-c" : "N/A")}</p>
          <p>Replaceable Battery: {yesNo(data.battery_replaceable)}</p>
          <p>Weight: {fmt(data.weight_g, 1)} g</p>
          <p>Length: {fmt(data.length_mm, 1)} mm</p>
          <p>Head Diameter: {fmt(data.head_diameter_mm, 1)} mm</p>
          <p>Tail Switch: {yesNo(data.has_tail_switch)}</p>
          <p>Side Switch: {yesNo(data.has_side_switch)}</p>
          <h3>Durability</h3>
          <p>IP Rating: {data.waterproof_rating || "N/A"}</p>
          <p>Impact Resistance: {fmt(data.impact_resistance_m, 1)} m</p>
          <p>Body Material: {data.body_material || "N/A"}</p>
        </div>
      </div>

      <div className="panel">
        <h3>Recommendation Summary</h3>
        {positive.length > 0 ? (
          <ul className="clean-list">
            {positive.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Need more testing data for strong recommendation bullets.</p>
        )}
        <h3>Tradeoffs To Consider</h3>
        {drawbacks.length > 0 ? (
          <ul className="clean-list">
            {drawbacks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No major tradeoffs flagged from current data.</p>
        )}
      </div>

      <div className="panel">
        <h3>Score Breakdown</h3>
        <div className="score-grid">
          <p>Tactical: {fmt(data.tactical_score, 2)}</p>
          <p>EDC: {fmt(data.edc_score, 2)}</p>
          <p>Value: {fmt(data.value_score, 2)}</p>
          <p>Throw: {fmt(data.throw_score, 2)}</p>
          <p>Flood: {fmt(data.flood_score, 2)}</p>
        </div>
      </div>

      <div className="panel">
        <h3>Mode Table</h3>
        {data.modes && data.modes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Output (lm)</th>
                  <th>Runtime (min)</th>
                  <th>Candela</th>
                  <th>Throw (m)</th>
                </tr>
              </thead>
              <tbody>
                {data.modes.map((mode) => (
                  <tr key={mode.name}>
                    <td>{mode.name}</td>
                    <td>{fmt(mode.output_lumens)}</td>
                    <td>{fmt(mode.runtime_min)}</td>
                    <td>{fmt(mode.candela)}</td>
                    <td>{fmt(mode.beam_distance_m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No per-mode runtime/output table is available yet for this model.</p>
        )}
      </div>

      <div className="panel">
        <h3>Alternatives You Should Also Check</h3>
        <div className="card-grid">
          {alternatives.map((alt) => (
            <article key={alt.id} className="product-card">
              <div className="image-card">
                {alt.image_url ? (
                  <img src={alt.image_url} alt={`${alt.brand} ${alt.name}`} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>
              <h4>
                <Link href={`/flashlights/${alt.id}`}>
                  {alt.brand} {alt.name}
                </Link>
              </h4>
              <p className="muted clamp-3">{alt.description || "See detail page for full breakdown."}</p>
              <div className="spec-row">
                <span>{fmt(alt.max_lumens)} lm</span>
                <span>{fmt(alt.beam_distance_m)} m</span>
                <span>{alt.price_usd !== undefined ? `$${fmt(alt.price_usd, 2)}` : "N/A"}</span>
              </div>
              <div className="cta-row">
                <Link href={`/compare?ids=${data.id},${alt.id}`} className="button-link button-secondary">
                  Compare
                </Link>
                <AmazonCTA href={alt.amazon_url} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
