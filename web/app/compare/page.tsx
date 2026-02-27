import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";

type CompareModel = {
  id: number;
  brand: string;
  name: string;
  category: string;
  image_url: string;
  amazon_url: string;
  price_usd: number;
  max_lumens: number;
  max_candela: number;
  beam_distance_m: number;
  runtime_high_min: number;
  runtime_medium_min: number;
  weight_g: number;
  length_mm: number;
  waterproof_rating: string;
  usb_c_rechargeable: boolean;
  battery_type: string;
  tactical_score: number;
  edc_score: number;
  value_score: number;
  throw_score: number;
  flood_score: number;
  recommendation: string;
};

const MODELS: CompareModel[] = [
  {
    id: 1,
    brand: "Wurkkos",
    name: "FC11C",
    category: "EDC",
    image_url: "https://images.unsplash.com/photo-1536623975707-c4b3b2af565d?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/dp/B0CJY12QZR?tag=flashlightrat-20",
    price_usd: 39.99,
    max_lumens: 1200,
    max_candela: 12000,
    beam_distance_m: 220,
    runtime_high_min: 95,
    runtime_medium_min: 300,
    weight_g: 79,
    length_mm: 116,
    waterproof_rating: "IPX7",
    usb_c_rechargeable: true,
    battery_type: "18650",
    tactical_score: 78.4,
    edc_score: 91.5,
    value_score: 88,
    throw_score: 69.1,
    flood_score: 84.5,
    recommendation: "Best budget EDC for daily carry and USB-C convenience."
  },
  {
    id: 2,
    brand: "Sofirn",
    name: "IF22A",
    category: "Throw",
    image_url: "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/dp/B09TZJ6CPN?tag=flashlightrat-20",
    price_usd: 54.99,
    max_lumens: 2100,
    max_candela: 85000,
    beam_distance_m: 680,
    runtime_high_min: 75,
    runtime_medium_min: 220,
    weight_g: 126,
    length_mm: 127,
    waterproof_rating: "IPX8",
    usb_c_rechargeable: true,
    battery_type: "21700",
    tactical_score: 89.2,
    edc_score: 73,
    value_score: 79.2,
    throw_score: 95.4,
    flood_score: 76.8,
    recommendation: "Best long-range throw under $60."
  },
  {
    id: 3,
    brand: "Fenix",
    name: "PD36R Pro",
    category: "Tactical",
    image_url: "https://images.unsplash.com/photo-1586864387789-628af9feed72?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Fenix+PD36R+Pro&tag=flashlightrat-20",
    price_usd: 119.95,
    max_lumens: 2800,
    max_candela: 36000,
    beam_distance_m: 380,
    runtime_high_min: 180,
    runtime_medium_min: 420,
    weight_g: 169,
    length_mm: 145,
    waterproof_rating: "IP68",
    usb_c_rechargeable: true,
    battery_type: "21700",
    tactical_score: 92.6,
    edc_score: 81.2,
    value_score: 72.4,
    throw_score: 90.1,
    flood_score: 82.8,
    recommendation: "Premium all-around tactical choice with robust build quality."
  },
  {
    id: 4,
    brand: "Olight",
    name: "Warrior 3S",
    category: "Tactical",
    image_url: "https://images.unsplash.com/photo-1484111199463-27f6f6a4dd84?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Olight+Warrior+3S&tag=flashlightrat-20",
    price_usd: 129.99,
    max_lumens: 2300,
    max_candela: 23000,
    beam_distance_m: 300,
    runtime_high_min: 130,
    runtime_medium_min: 360,
    weight_g: 176,
    length_mm: 139,
    waterproof_rating: "IPX8",
    usb_c_rechargeable: false,
    battery_type: "21700 (proprietary)",
    tactical_score: 90.8,
    edc_score: 77.3,
    value_score: 68.9,
    throw_score: 86.5,
    flood_score: 80.6,
    recommendation: "Great dual-switch tactical UX with very strong ergonomics."
  },
  {
    id: 5,
    brand: "Nitecore",
    name: "MH12 Pro",
    category: "EDC/Tactical",
    image_url: "https://images.unsplash.com/photo-1525869916826-972885c91c1e?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Nitecore+MH12+Pro&tag=flashlightrat-20",
    price_usd: 89.95,
    max_lumens: 3300,
    max_candela: 63000,
    beam_distance_m: 505,
    runtime_high_min: 100,
    runtime_medium_min: 260,
    weight_g: 139,
    length_mm: 152,
    waterproof_rating: "IP68",
    usb_c_rechargeable: true,
    battery_type: "21700",
    tactical_score: 91.3,
    edc_score: 79.1,
    value_score: 81.4,
    throw_score: 93.7,
    flood_score: 84.9,
    recommendation: "High output and throw with strong value-to-performance ratio."
  },
  {
    id: 6,
    brand: "Acebeam",
    name: "E75",
    category: "Flood / Utility",
    image_url: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Acebeam+E75&tag=flashlightrat-20",
    price_usd: 99.9,
    max_lumens: 3000,
    max_candela: 17000,
    beam_distance_m: 260,
    runtime_high_min: 110,
    runtime_medium_min: 360,
    weight_g: 206,
    length_mm: 129,
    waterproof_rating: "IP68",
    usb_c_rechargeable: true,
    battery_type: "21700",
    tactical_score: 82.4,
    edc_score: 78.8,
    value_score: 79.9,
    throw_score: 72.4,
    flood_score: 94.6,
    recommendation: "Top flood beam option for work, camping, and close-range visibility."
  },
  {
    id: 7,
    brand: "Streamlight",
    name: "ProTac HL-X",
    category: "Duty",
    image_url: "https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Streamlight+ProTac+HL-X&tag=flashlightrat-20",
    price_usd: 79.99,
    max_lumens: 1000,
    max_candela: 27000,
    beam_distance_m: 330,
    runtime_high_min: 75,
    runtime_medium_min: 210,
    weight_g: 167,
    length_mm: 143,
    waterproof_rating: "IPX7",
    usb_c_rechargeable: false,
    battery_type: "18650 / CR123A",
    tactical_score: 87.2,
    edc_score: 70.4,
    value_score: 82.1,
    throw_score: 84.4,
    flood_score: 69.5,
    recommendation: "Reliable duty-style light with strong ecosystem and reputation."
  },
  {
    id: 8,
    brand: "ThruNite",
    name: "TC20 V2",
    category: "General / Flood",
    image_url: "https://images.unsplash.com/photo-1449247613801-ab06418e2861?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=ThruNite+TC20+V2&tag=flashlightrat-20",
    price_usd: 69.95,
    max_lumens: 4061,
    max_candela: 17000,
    beam_distance_m: 260,
    runtime_high_min: 95,
    runtime_medium_min: 270,
    weight_g: 142,
    length_mm: 119,
    waterproof_rating: "IPX8",
    usb_c_rechargeable: true,
    battery_type: "26650",
    tactical_score: 80.6,
    edc_score: 76.3,
    value_score: 88.7,
    throw_score: 70.9,
    flood_score: 93.2,
    recommendation: "Excellent lumen-per-dollar flood performer."
  },
  {
    id: 9,
    brand: "Skilhunt",
    name: "M200 V3",
    category: "EDC",
    image_url: "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Skilhunt+M200+V3&tag=flashlightrat-20",
    price_usd: 59.99,
    max_lumens: 1400,
    max_candela: 8300,
    beam_distance_m: 182,
    runtime_high_min: 115,
    runtime_medium_min: 420,
    weight_g: 87,
    length_mm: 104,
    waterproof_rating: "IPX8",
    usb_c_rechargeable: false,
    battery_type: "18650",
    tactical_score: 72.5,
    edc_score: 90.4,
    value_score: 85.1,
    throw_score: 63.2,
    flood_score: 83.4,
    recommendation: "Compact high-quality EDC with strong practical runtime."
  },
  {
    id: 10,
    brand: "Convoy",
    name: "M21B SFT40",
    category: "Throw / Value",
    image_url: "https://images.unsplash.com/photo-1527169402691-a809bc9e0a4e?auto=format&fit=crop&w=1200&q=80",
    amazon_url: "https://www.amazon.com/s?k=Convoy+M21B+SFT40&tag=flashlightrat-20",
    price_usd: 54.0,
    max_lumens: 2000,
    max_candela: 105000,
    beam_distance_m: 700,
    runtime_high_min: 70,
    runtime_medium_min: 220,
    weight_g: 171,
    length_mm: 145,
    waterproof_rating: "IPX6",
    usb_c_rechargeable: false,
    battery_type: "21700",
    tactical_score: 86.3,
    edc_score: 68.1,
    value_score: 90.2,
    throw_score: 96.1,
    flood_score: 65.8,
    recommendation: "Extreme throw per dollar if you prioritize beam distance."
  }
];

function parseIDs(input: string | undefined) {
  if (!input) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of input.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    if (!MODELS.some((m) => m.id === n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 4) break;
  }
  return out;
}

function compareHref(ids: number[]) {
  return `/compare?ids=${ids.join(",")}`;
}

function maxFor(items: CompareModel[], pick: (x: CompareModel) => number) {
  return Math.max(...items.map(pick));
}

function minFor(items: CompareModel[], pick: (x: CompareModel) => number) {
  return Math.min(...items.map(pick));
}

export default async function ComparePage({
  searchParams
}: {
  searchParams?: { ids?: string };
}) {
  const parsed = parseIDs(searchParams?.ids);
  const defaultIDs = [1, 2, 3];
  const selectedIDs = parsed.length > 0 ? parsed : defaultIDs;
  const selectedSet = new Set(selectedIDs);
  const items = selectedIDs
    .map((id) => MODELS.find((m) => m.id === id))
    .filter((x): x is CompareModel => Boolean(x));

  const bestThrow = MODELS.reduce((a, b) => (b.throw_score > a.throw_score ? b : a));
  const bestEDC = MODELS.reduce((a, b) => (b.edc_score > a.edc_score ? b : a));
  const bestValue = MODELS.reduce((a, b) => (b.value_score > a.value_score ? b : a));

  const hiLumens = maxFor(items, (x) => x.max_lumens);
  const hiCandela = maxFor(items, (x) => x.max_candela);
  const hiThrow = maxFor(items, (x) => x.beam_distance_m);
  const hiRuntime = maxFor(items, (x) => x.runtime_high_min);
  const lowWeight = minFor(items, (x) => x.weight_g);
  const lowPrice = minFor(items, (x) => x.price_usd);
  const hiTactical = maxFor(items, (x) => x.tactical_score);
  const hiEDC = maxFor(items, (x) => x.edc_score);
  const hiValue = maxFor(items, (x) => x.value_score);
  const hiFlood = maxFor(items, (x) => x.flood_score);

  return (
    <section className="grid">
      <div className="panel hero">
        <p className="kicker">Comparison Lab</p>
        <h1>Compare 10 Popular Flashlights</h1>
        <p className="muted">
          This page uses a hardcoded 10-model benchmark set for now, so you can evaluate tactical, EDC, throw,
          flood, runtime, weight, and value side by side.
        </p>
      </div>

      <div className="panel">
        <h3>Quick Recommendations</h3>
        <div className="guide-grid">
          <article className="guide-card">
            <p className="kicker">Best Throw</p>
            <h4>
              {bestThrow.brand} {bestThrow.name}
            </h4>
            <p className="muted">Highest throw score in this 10-model set.</p>
          </article>
          <article className="guide-card">
            <p className="kicker">Best EDC</p>
            <h4>
              {bestEDC.brand} {bestEDC.name}
            </h4>
            <p className="muted">Highest everyday-carry score for practical daily use.</p>
          </article>
          <article className="guide-card">
            <p className="kicker">Best Value</p>
            <h4>
              {bestValue.brand} {bestValue.name}
            </h4>
            <p className="muted">Best price-to-performance balance.</p>
          </article>
        </div>
      </div>

      <div className="panel">
        <h3>Select Up To 4 Models</h3>
        <div className="compare-controls">
          {MODELS.map((item) => {
            const active = selectedSet.has(item.id);
            if (active) {
              const next = selectedIDs.filter((id) => id !== item.id);
              return (
                <Link
                  key={item.id}
                  href={compareHref(next.length > 0 ? next : defaultIDs)}
                  className="compare-chip active"
                >
                  {item.brand} {item.name} - Remove
                </Link>
              );
            }
            if (selectedIDs.length >= 4) {
              return (
                <span key={item.id} className="compare-chip disabled">
                  {item.brand} {item.name}
                </span>
              );
            }
            return (
              <Link key={item.id} href={compareHref([...selectedIDs, item.id])} className="compare-chip">
                {item.brand} {item.name} - Add
              </Link>
            );
          })}
        </div>
      </div>

      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel product-card">
            <div className="image-card">
              <img src={item.image_url} alt={`${item.brand} ${item.name}`} loading="lazy" />
            </div>
            <p className="kicker">{item.category}</p>
            <h3>
              {item.brand} {item.name}
            </h3>
            <p className="muted">{item.recommendation}</p>
            <div className="spec-row">
              <span>${item.price_usd.toFixed(2)}</span>
              <span>{item.max_lumens.toLocaleString()} lm</span>
              <span>{item.beam_distance_m.toLocaleString()} m</span>
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

      <div className="table-wrap compare-table">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              {items.map((item) => (
                <th key={`head-${item.id}`} className="compare-model-head">
                  <h4>
                    {item.brand} {item.name}
                  </h4>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="compare-row-label">Price (USD)</td>
              {items.map((item) => (
                <td key={`price-${item.id}`} className={item.price_usd === lowPrice ? "compare-best" : ""}>
                  ${item.price_usd.toFixed(2)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Max Lumens</td>
              {items.map((item) => (
                <td key={`lm-${item.id}`} className={item.max_lumens === hiLumens ? "compare-best" : ""}>
                  {item.max_lumens.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Max Candela</td>
              {items.map((item) => (
                <td key={`cd-${item.id}`} className={item.max_candela === hiCandela ? "compare-best" : ""}>
                  {item.max_candela.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Beam Distance (m)</td>
              {items.map((item) => (
                <td key={`throw-${item.id}`} className={item.beam_distance_m === hiThrow ? "compare-best" : ""}>
                  {item.beam_distance_m.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Runtime High (min)</td>
              {items.map((item) => (
                <td key={`rt-hi-${item.id}`} className={item.runtime_high_min === hiRuntime ? "compare-best" : ""}>
                  {item.runtime_high_min.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Runtime Medium (min)</td>
              {items.map((item) => (
                <td key={`rt-med-${item.id}`}>{item.runtime_medium_min.toLocaleString()}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Weight (g)</td>
              {items.map((item) => (
                <td key={`weight-${item.id}`} className={item.weight_g === lowWeight ? "compare-best" : ""}>
                  {item.weight_g.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Length (mm)</td>
              {items.map((item) => (
                <td key={`len-${item.id}`}>{item.length_mm.toLocaleString()}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Waterproof</td>
              {items.map((item) => (
                <td key={`ip-${item.id}`}>{item.waterproof_rating}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">USB-C Recharge</td>
              {items.map((item) => (
                <td key={`usb-${item.id}`}>{item.usb_c_rechargeable ? "Yes" : "No"}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Battery Type</td>
              {items.map((item) => (
                <td key={`bat-${item.id}`}>{item.battery_type}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Tactical Score</td>
              {items.map((item) => (
                <td key={`tac-${item.id}`} className={item.tactical_score === hiTactical ? "compare-best" : ""}>
                  {item.tactical_score.toFixed(1)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">EDC Score</td>
              {items.map((item) => (
                <td key={`edc-${item.id}`} className={item.edc_score === hiEDC ? "compare-best" : ""}>
                  {item.edc_score.toFixed(1)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Value Score</td>
              {items.map((item) => (
                <td key={`value-${item.id}`} className={item.value_score === hiValue ? "compare-best" : ""}>
                  {item.value_score.toFixed(1)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Throw Score</td>
              {items.map((item) => (
                <td key={`throw-score-${item.id}`}>{item.throw_score.toFixed(1)}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Flood Score</td>
              {items.map((item) => (
                <td key={`flood-score-${item.id}`} className={item.flood_score === hiFlood ? "compare-best" : ""}>
                  {item.flood_score.toFixed(1)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-row-label">Buy Link</td>
              {items.map((item) => (
                <td key={`buy-${item.id}`}>
                  <AmazonCTA href={item.amazon_url} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
