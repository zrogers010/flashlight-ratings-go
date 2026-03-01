import type { Metadata } from "next";
import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { fetchCompare, fetchFlashlights } from "@/lib/api";

export const metadata: Metadata = {
  title: "Compare Flashlights Side by Side — Specs, Scores & Prices",
  description:
    "Compare flashlight specs, scores, and prices side by side. Find the best option by comparing lumens, throw, runtime, weight, and more."
};

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function yesNo(v?: boolean) {
  if (v === undefined) return "—";
  return v ? "Yes" : "No";
}

function topScore(item: { tactical_score?: number; edc_score?: number; value_score?: number; throw_score?: number; flood_score?: number }) {
  return Math.max(
    item.tactical_score || 0,
    item.edc_score || 0,
    item.value_score || 0,
    item.throw_score || 0,
    item.flood_score || 0
  );
}

type SpecRow = { label: string; values: string[]; bestIdx?: number; higherIsBetter?: boolean };

function findBestIdx(values: (number | undefined)[], higherIsBetter = true): number | undefined {
  let bestIdx: number | undefined;
  let bestVal: number | undefined;
  values.forEach((v, i) => {
    if (v === undefined) return;
    if (bestVal === undefined || (higherIsBetter ? v > bestVal : v < bestVal)) {
      bestVal = v;
      bestIdx = i;
    }
  });
  const defined = values.filter((v) => v !== undefined);
  if (defined.length < 2) return undefined;
  return bestIdx;
}

export default async function ComparePage({
  searchParams
}: {
  searchParams?: { ids?: string };
}) {
  const idStr = searchParams?.ids || "";
  const ids = idStr.split(",").map((s) => s.trim()).filter(Boolean);
  const catalog = await fetchFlashlights();

  if (ids.length < 2) {
    return (
      <section className="grid">
        <Breadcrumbs items={[{ label: "Compare" }]} />
        <div className="panel hero" style={{ textAlign: "center" }}>
          <p className="kicker">Side-by-Side Comparison</p>
          <h1>Compare Flashlights</h1>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
            Select 2 or more flashlights to compare specs, scores, and prices side by side.
          </p>
        </div>
        <div className="panel">
          <h3 style={{ marginBottom: 16 }}>Pick flashlights to compare</h3>
          <div className="card-grid">
            {catalog.items.slice(0, 12).map((item) => (
              <article key={item.id} className="product-card">
                <Link href={`/flashlights/${item.id}`} className="card-link-overlay" aria-label={`View ${item.brand} ${item.name} details`} />
                <div className="image-card">
                  <ImageWithFallback src={item.image_url} alt={`${item.brand} ${item.name}`} />
                </div>
                <p className="kicker">{item.brand}</p>
                <h4>{item.name}</h4>
                <div className="spec-row">
                  <span>{fmt(item.max_lumens)} lm</span>
                  <span>{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "—"}</span>
                </div>
                <div className="cta-row">
                  <Link href={`/compare?ids=${ids.length ? ids.join(",") + "," : ""}${item.id}`} className="btn btn-ghost btn-sm">
                    + Compare
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const compared = await fetchCompare(ids.join(","));
  const items = compared.items;

  const specs: SpecRow[] = [
    {
      label: "Price",
      values: items.map((i) => i.price_usd !== undefined ? `$${fmt(i.price_usd, 2)}` : "—"),
      bestIdx: findBestIdx(items.map((i) => i.price_usd), false)
    },
    {
      label: "Score",
      values: items.map((i) => { const s = topScore(i); return s > 0 ? s.toFixed(1) : "—"; }),
      bestIdx: findBestIdx(items.map((i) => topScore(i) || undefined))
    },
    {
      label: "Max Lumens",
      values: items.map((i) => fmt(i.max_lumens)),
      bestIdx: findBestIdx(items.map((i) => i.max_lumens))
    },
    {
      label: "Max Candela",
      values: items.map((i) => fmt(i.max_candela)),
      bestIdx: findBestIdx(items.map((i) => i.max_candela))
    },
    {
      label: "Beam Distance",
      values: items.map((i) => i.beam_distance_m ? `${fmt(i.beam_distance_m)}m` : "—"),
      bestIdx: findBestIdx(items.map((i) => i.beam_distance_m))
    },
    {
      label: "Runtime (High)",
      values: items.map((i) => i.runtime_high_min ? `${fmt(i.runtime_high_min)} min` : "—"),
      bestIdx: findBestIdx(items.map((i) => i.runtime_high_min))
    },
    {
      label: "IP Rating",
      values: items.map((i) => i.waterproof_rating || "—")
    },
    {
      label: "Tactical Score",
      values: items.map((i) => i.tactical_score ? i.tactical_score.toFixed(1) : "—"),
      bestIdx: findBestIdx(items.map((i) => i.tactical_score))
    },
    {
      label: "EDC Score",
      values: items.map((i) => i.edc_score ? i.edc_score.toFixed(1) : "—"),
      bestIdx: findBestIdx(items.map((i) => i.edc_score))
    },
    {
      label: "Value Score",
      values: items.map((i) => i.value_score ? i.value_score.toFixed(1) : "—"),
      bestIdx: findBestIdx(items.map((i) => i.value_score))
    },
    {
      label: "Throw Score",
      values: items.map((i) => i.throw_score ? i.throw_score.toFixed(1) : "—"),
      bestIdx: findBestIdx(items.map((i) => i.throw_score))
    },
    {
      label: "Flood Score",
      values: items.map((i) => i.flood_score ? i.flood_score.toFixed(1) : "—"),
      bestIdx: findBestIdx(items.map((i) => i.flood_score))
    }
  ];

  const addableItems = catalog.items.filter((c) => !ids.includes(String(c.id))).slice(0, 6);

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Compare" }]} />

      <div className="panel hero">
        <p className="kicker">Side-by-Side Comparison</p>
        <h1>Compare {items.length} Flashlights</h1>
        <p className="muted">
          Specs, scores, and prices compared. Best value in each row is highlighted.
        </p>
      </div>

      <div className="panel panel-flush">
        <div className="table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-row-label">Spec</th>
                {items.map((item) => (
                  <th key={item.id} className="compare-model-head">
                    <div style={{ padding: "4px 0" }}>
                      {item.image_url && (
                        <ImageWithFallback src={item.image_url} alt={`${item.brand} ${item.name}`} />
                      )}
                      <h4>
                        <Link href={`/flashlights/${item.id}`}>
                          {item.brand} {item.name}
                        </Link>
                      </h4>
                      <AmazonCTA href={item.amazon_url} price={item.price_usd} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map((row) => (
                <tr key={row.label}>
                  <td className="compare-row-label">{row.label}</td>
                  {row.values.map((val, i) => (
                    <td
                      key={i}
                      className={row.bestIdx === i ? "compare-best" : ""}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addableItems.length > 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>Add another to the comparison</h3>
          <div className="spec-row">
            {addableItems.map((item) => (
              <Link
                key={item.id}
                href={`/compare?ids=${ids.join(",")},${item.id}`}
                className="chip"
              >
                + {item.brand} {item.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <AmazonDisclosure />
    </section>
  );
}
