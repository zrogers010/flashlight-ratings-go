import type { Metadata } from "next";
import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { fetchIntelligenceRecommendations } from "@/lib/api";

export const metadata: Metadata = {
  title: "Find Your Perfect Flashlight — Personalized Recommendations",
  description:
    "Answer 4 questions and get data-driven flashlight recommendations tailored to your use case, budget, battery preference, and size requirements."
};

type UseCase = "edc" | "tactical" | "law-enforcement" | "camping" | "search-rescue" | "weapon-mount" | "keychain";
type BatteryPreference = "any" | "18650" | "21700" | "cr123a" | "proprietary";
type SizeConstraint = "any" | "pocket" | "compact" | "full-size";

function parseUseCase(input?: string): UseCase {
  const valid: UseCase[] = ["edc", "tactical", "law-enforcement", "camping", "search-rescue", "weapon-mount", "keychain"];
  return valid.includes((input || "") as UseCase) ? (input as UseCase) : "edc";
}

function parseBudget(input?: string): number {
  const n = Number(input || "80");
  if (!Number.isFinite(n) || n <= 0) return 80;
  return Math.round(n * 100) / 100;
}

function parseBattery(input?: string): BatteryPreference {
  const valid: BatteryPreference[] = ["any", "18650", "21700", "cr123a", "proprietary"];
  return valid.includes((input || "") as BatteryPreference) ? (input as BatteryPreference) : "any";
}

function parseSize(input?: string): SizeConstraint {
  const valid: SizeConstraint[] = ["any", "pocket", "compact", "full-size"];
  return valid.includes((input || "") as SizeConstraint) ? (input as SizeConstraint) : "any";
}

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export default async function FindYoursPage({
  searchParams
}: {
  searchParams?: { use?: string; budget?: string; battery?: string; size?: string };
}) {
  const useCase = parseUseCase(searchParams?.use);
  const budget = parseBudget(searchParams?.budget);
  const battery = parseBattery(searchParams?.battery);
  const size = parseSize(searchParams?.size);

  const run = await fetchIntelligenceRecommendations({
    intended_use: useCase,
    budget_usd: budget,
    battery_preference: battery,
    size_constraint: size
  });

  return (
    <section className="grid">
      <Breadcrumbs items={[{ label: "Find Yours" }]} />

      <div className="panel hero" style={{ textAlign: "center" }}>
        <p className="kicker">Personalized Recommendations</p>
        <h1>Find Your Perfect Flashlight</h1>
        <p className="muted" style={{ maxWidth: 560, margin: "0 auto" }}>
          Tell us what you need and our scoring algorithm will match you with the
          best options from our catalog.
        </p>
      </div>

      <form method="get" className="panel">
        <h3 style={{ marginBottom: 16 }}>What are you looking for?</h3>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="use">Use Case</label>
            <select name="use" id="use" defaultValue={run.intended_use}>
              <option value="edc">EDC / Everyday Carry</option>
              <option value="tactical">Tactical / Defense</option>
              <option value="law-enforcement">Law Enforcement</option>
              <option value="camping">Camping / Outdoors</option>
              <option value="search-rescue">Search &amp; Rescue</option>
              <option value="weapon-mount">Weapon Mount</option>
              <option value="keychain">Keychain / Ultra-Compact</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="budget">Budget (USD)</label>
            <input name="budget" id="budget" type="number" min="10" max="500" step="5" defaultValue={run.budget_usd} />
          </div>
          <div className="form-group">
            <label htmlFor="battery">Battery Preference</label>
            <select name="battery" id="battery" defaultValue={run.battery_preference}>
              <option value="any">No Preference</option>
              <option value="18650">18650</option>
              <option value="21700">21700</option>
              <option value="cr123a">CR123A</option>
              <option value="proprietary">Proprietary</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="size">Size Constraint</label>
            <select name="size" id="size" defaultValue={run.size_constraint}>
              <option value="any">Any Size</option>
              <option value="pocket">Pocket (&lt;120mm)</option>
              <option value="compact">Compact (120-150mm)</option>
              <option value="full-size">Full-Size (150mm+)</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="button-link" type="submit">
            Find My Flashlight
          </button>
        </div>
      </form>

      <div className="panel">
        <div className="section-header">
          <h2>Top {run.top_results.length} Matches</h2>
          <span className="badge badge-teal" style={{ fontFamily: "var(--font-mono)" }}>
            {run.algorithm_version}
          </span>
        </div>
        <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
          Score = Use Case (55%) + Budget Fit (20%) + Battery Match (15%) + Size Fit (10%)
        </p>

        <div className="card-grid">
          {run.top_results.map((entry, idx) => (
            <article key={entry.model_id} className="product-card">
              <div className="image-card">
                {entry.image_url ? (
                  <img src={entry.image_url} alt={`${entry.brand} ${entry.name}`} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <p className="kicker">Match #{idx + 1}</p>
                  <h3 style={{ fontSize: "1.05rem" }}>
                    <Link href={`/flashlights/${entry.model_id}`}>
                      {entry.brand} {entry.name}
                    </Link>
                  </h3>
                </div>
                <ScoreBadge score={entry.overall_score} />
              </div>

              <div className="spec-row">
                <span className="badge badge-teal">{entry.category}</span>
                <span>{entry.price_usd !== undefined ? `$${fmt(entry.price_usd, 2)}` : "—"}</span>
                <span>{fmt(entry.max_lumens)} lm</span>
                <span>{fmt(entry.beam_distance_m)} m</span>
              </div>

              <div className="score-bars">
                <div className="bar-row">
                  <label><span>Use Case</span><strong>{entry.use_case_score.toFixed(0)}</strong></label>
                  <div className="bar-track"><span className="bar-fill" style={{ width: `${pct(entry.use_case_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label><span>Budget Fit</span><strong>{entry.budget_score.toFixed(0)}</strong></label>
                  <div className="bar-track"><span className="bar-fill teal" style={{ width: `${pct(entry.budget_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label><span>Battery</span><strong>{entry.battery_match_score.toFixed(0)}</strong></label>
                  <div className="bar-track"><span className="bar-fill teal" style={{ width: `${pct(entry.battery_match_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label><span>Size Fit</span><strong>{entry.size_fit_score.toFixed(0)}</strong></label>
                  <div className="bar-track"><span className="bar-fill teal" style={{ width: `${pct(entry.size_fit_score)}%` }} /></div>
                </div>
              </div>

              <div className="cta-row">
                <Link href={`/flashlights/${entry.model_id}`} className="btn btn-ghost btn-sm">
                  Details
                </Link>
                <AmazonCTA href={entry.amazon_url} price={entry.price_usd} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
