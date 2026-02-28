import Link from "next/link";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { AmazonCTA } from "@/components/AmazonCTA";
import { createIntelligenceRun, fetchIntelligenceRun } from "@/lib/api";

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
  if (v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function pct(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export default async function ComparePage({
  searchParams
}: {
  searchParams?: {
    run_id?: string;
    use?: string;
    budget?: string;
    battery?: string;
    size?: string;
  };
}) {
  const useCase = parseUseCase(searchParams?.use);
  const budget = parseBudget(searchParams?.budget);
  const battery = parseBattery(searchParams?.battery);
  const size = parseSize(searchParams?.size);

  const run = searchParams?.run_id
    ? await fetchIntelligenceRun(searchParams.run_id)
    : await createIntelligenceRun({
        intended_use: useCase,
        budget_usd: budget,
        battery_preference: battery,
        size_constraint: size
      });

  const shareURL = `/compare?run_id=${run.run_id}`;

  return (
    <section className="grid">
      <div className="panel hero">
        <p className="kicker">Flashlight Intelligence Platform</p>
        <h1>Algorithmic Flashlight Ratings</h1>
        <p className="muted">
          Runs are now persisted in the database. You can share or revisit a specific run via `run_id`.
        </p>
        <div className="spec-row">
          <span>Run ID: {run.run_id}</span>
          <span>Algorithm: {run.algorithm_version}</span>
          <span>Created: {new Date(run.created_at).toLocaleString()}</span>
        </div>
        <div className="cta-row">
          <Link href={shareURL} className="button-link button-secondary">
            Permalink
          </Link>
        </div>
      </div>

      <form method="get" className="panel intelligence-form">
        <h3>Finder Inputs</h3>
        <div className="intelligence-grid">
          <label>
            Intended Use
            <select name="use" defaultValue={run.intended_use}>
              <option value="edc">EDC</option>
              <option value="tactical">Tactical</option>
              <option value="law-enforcement">Law Enforcement</option>
              <option value="camping">Camping</option>
              <option value="search-rescue">Search & Rescue</option>
              <option value="weapon-mount">Weapon Mount</option>
              <option value="keychain">Keychain</option>
            </select>
          </label>
          <label>
            Budget (USD)
            <input name="budget" type="number" min="10" step="1" defaultValue={run.budget_usd} />
          </label>
          <label>
            Battery Preference
            <select name="battery" defaultValue={run.battery_preference}>
              <option value="any">Any</option>
              <option value="18650">18650</option>
              <option value="21700">21700</option>
              <option value="cr123a">CR123A</option>
              <option value="proprietary">Proprietary</option>
            </select>
          </label>
          <label>
            Size Constraint
            <select name="size" defaultValue={run.size_constraint}>
              <option value="any">Any</option>
              <option value="pocket">Pocket</option>
              <option value="compact">Compact</option>
              <option value="full-size">Full-Size</option>
            </select>
          </label>
        </div>
        <button className="button-link" type="submit">
          Run Rating Algorithm
        </button>
      </form>

      <div className="panel">
        <h2>Top 5 Ranked Results</h2>
        <p className="muted">
          Weighted score = Use Case (55%) + Budget Fit (20%) + Battery Match (15%) + Size Fit (10%)
        </p>
        <div className="card-grid">
          {run.top_results.map((entry, idx) => (
            <article key={entry.model_id} className="panel product-card">
              <div className="image-card">
                {entry.image_url ? (
                  <img src={entry.image_url} alt={`${entry.brand} ${entry.name}`} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>
              <p className="kicker">Rank #{idx + 1}</p>
              <h3>
                {entry.brand} {entry.name}
              </h3>
              <div className="spec-row">
                <span>{entry.category}</span>
                <span>{entry.price_usd !== undefined ? `$${fmt(entry.price_usd, 2)}` : "N/A"}</span>
                <span>{fmt(entry.max_lumens)} lm</span>
                <span>{fmt(entry.beam_distance_m)} m</span>
              </div>
              <div className="score-stack">
                <div>
                  <span>Overall</span>
                  <strong>{entry.overall_score.toFixed(1)}</strong>
                </div>
                <div>
                  <span>Use Case</span>
                  <strong>{entry.use_case_score.toFixed(1)}</strong>
                </div>
                <div>
                  <span>Budget Fit</span>
                  <strong>{entry.budget_score.toFixed(1)}</strong>
                </div>
                <div>
                  <span>Battery Match</span>
                  <strong>{entry.battery_match_score.toFixed(1)}</strong>
                </div>
                <div>
                  <span>Size Fit</span>
                  <strong>{entry.size_fit_score.toFixed(1)}</strong>
                </div>
              </div>
              <div className="score-bars">
                <div className="bar-row">
                  <label>Use</label>
                  <div><span style={{ width: `${pct(entry.use_case_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label>Budget</label>
                  <div><span style={{ width: `${pct(entry.budget_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label>Battery</label>
                  <div><span style={{ width: `${pct(entry.battery_match_score)}%` }} /></div>
                </div>
                <div className="bar-row">
                  <label>Size</label>
                  <div><span style={{ width: `${pct(entry.size_fit_score)}%` }} /></div>
                </div>
              </div>
              <div className="cta-row">
                <Link href={`/flashlights/${entry.model_id}`} className="button-link button-secondary">
                  Detail
                </Link>
                <AmazonCTA href={entry.amazon_url} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
