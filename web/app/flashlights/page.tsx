import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FlashlightCard } from "@/components/FlashlightCard";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { fetchFlashlights } from "@/lib/api";

export const metadata: Metadata = {
  title: "All Flashlights — Full Catalog with Specs & Prices",
  description:
    "Browse every flashlight in our catalog. Specs, scores, images, and current Amazon pricing for each model."
};

export default async function FlashlightsPage() {
  const data = await fetchFlashlights();

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Catalog" }]} />

      <div className="panel hero">
        <p className="kicker">Full Catalog</p>
        <h1>All Flashlights</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          {data.total} models with verified specs, algorithmic scores, and real-time Amazon pricing.
        </p>
      </div>

      <div className="card-grid">
        {data.items.map((item) => (
          <FlashlightCard key={item.id} item={item} />
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No flashlights in the catalog yet.</p>
        </div>
      )}

      <AmazonDisclosure />
    </section>
  );
}
