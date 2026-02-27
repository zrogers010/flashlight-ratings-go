import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { fetchCompare } from "@/lib/api";
import Link from "next/link";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export default async function ComparePage({
  searchParams
}: {
  searchParams?: { ids?: string };
}) {
  const sp = searchParams || {};
  const ids = sp.ids || "";
  const data = ids ? await fetchCompare(ids) : { items: [] };

  return (
    <section className="grid">
      <div className="panel">
        <p className="kicker">Comparison</p>
        <h1>Compare Flashlights</h1>
        <p className="muted">
          Use query param format <code>?ids=1,2,3</code> to compare models.
        </p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Lumens</th>
              <th>Candela</th>
              <th>Throw (m)</th>
              <th>Runtime High (min)</th>
              <th>IP</th>
              <th>Price</th>
              <th>Tactical</th>
              <th>EDC</th>
              <th>Value</th>
              <th>Amazon</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/flashlights/${item.id}`}>
                    {item.brand} {item.name}
                  </Link>
                </td>
                <td>{fmt(item.max_lumens)}</td>
                <td>{fmt(item.max_candela)}</td>
                <td>{fmt(item.beam_distance_m)}</td>
                <td>{fmt(item.runtime_high_min)}</td>
                <td>{item.waterproof_rating || "N/A"}</td>
                <td>{item.price_usd !== undefined ? `$${fmt(item.price_usd, 2)}` : "N/A"}</td>
                <td>{fmt(item.tactical_score, 2)}</td>
                <td>{fmt(item.edc_score, 2)}</td>
                <td>{fmt(item.value_score, 2)}</td>
                <td>
                  <AmazonCTA href={item.amazon_url} />
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={11}>No comparison data yet. Provide ids in query params.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
