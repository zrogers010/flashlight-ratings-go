import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { fetchFlashlightByID } from "@/lib/api";

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

export default async function FlashlightDetailPage({
  params
}: {
  params: { id: string };
}) {
  const data = await fetchFlashlightByID(params.id);
  const images = data.image_urls?.length ? data.image_urls : data.image_url ? [data.image_url] : [];

  return (
    <section className="grid">
      <div className="panel hero">
        <p className="kicker">{data.brand}</p>
        <h1>
          {data.name} {data.model_code ? <span className="muted">{data.model_code}</span> : null}
        </h1>
        <p className="muted">{data.description || "No description available yet."}</p>
        <div className="cta-row">
          <AmazonCTA href={data.amazon_url} />
          <span className="price-pill">
            {data.price_usd !== undefined ? `$${fmt(data.price_usd, 2)}` : "Price unavailable"}
          </span>
        </div>
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
          <h3>Output & Runtime</h3>
          <p>Max Lumens: {fmt(data.max_lumens)}</p>
          <p>Max Candela: {fmt(data.max_candela)}</p>
          <p>Beam Distance: {fmt(data.beam_distance_m)} m</p>
          <p>Runtime Low: {fmt(data.runtime_low_min)} min</p>
          <p>Runtime Medium: {fmt(data.runtime_medium_min)} min</p>
          <p>Runtime High: {fmt(data.runtime_high_min)} min</p>
          <p>Runtime Turbo: {fmt(data.runtime_turbo_min)} min</p>
        </div>

        <div className="panel">
          <h3>Build & Carry</h3>
          <p>Weight: {fmt(data.weight_g, 1)} g</p>
          <p>Length: {fmt(data.length_mm, 1)} mm</p>
          <p>Head Diameter: {fmt(data.head_diameter_mm, 1)} mm</p>
          <p>Body Diameter: {fmt(data.body_diameter_mm, 1)} mm</p>
          <p>IP Rating: {data.waterproof_rating || "N/A"}</p>
          <p>Impact Resistance: {fmt(data.impact_resistance_m, 1)} m</p>
          <p>Switch Type: {data.switch_type || "N/A"}</p>
        </div>

        <div className="panel">
          <h3>Battery & Features</h3>
          <p>Battery Included: {yesNo(data.battery_included)}</p>
          <p>Battery Rechargeable: {yesNo(data.battery_rechargeable)}</p>
          <p>USB-C Charging: {yesNo(data.usb_c_rechargeable)}</p>
          <p>Compatible Batteries: {data.battery_types?.length ? data.battery_types.join(", ") : "N/A"}</p>
          <p>Strobe: {yesNo(data.has_strobe)}</p>
          <p>Memory Mode: {yesNo(data.has_memory_mode)}</p>
          <p>Lockout: {yesNo(data.has_lockout)}</p>
          <p>Moonlight Mode: {yesNo(data.has_moonlight_mode)}</p>
          <p>Magnetic Tailcap: {yesNo(data.has_magnetic_tailcap)}</p>
          <p>Pocket Clip: {yesNo(data.has_pocket_clip)}</p>
          <p>LED Model: {data.led_model || "N/A"}</p>
          <p>CRI: {fmt(data.cri)}</p>
          <p>CCT: {data.cct_min_k && data.cct_max_k ? `${fmt(data.cct_min_k)}-${fmt(data.cct_max_k)} K` : "N/A"}</p>
        </div>
      </div>

      <div className="panel">
        <h3>Scores</h3>
        <div className="score-grid">
          <p>Tactical: {fmt(data.tactical_score, 2)}</p>
          <p>EDC: {fmt(data.edc_score, 2)}</p>
          <p>Value: {fmt(data.value_score, 2)}</p>
          <p>Throw: {fmt(data.throw_score, 2)}</p>
          <p>Flood: {fmt(data.flood_score, 2)}</p>
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
