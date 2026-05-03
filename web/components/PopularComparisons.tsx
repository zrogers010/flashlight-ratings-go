import Link from "next/link";
import { ImageWithFallback } from "./ImageWithFallback";
import type { RankingItem } from "@/lib/api";

type PairSource = {
  label: string;
  description: string;
  items: RankingItem[];
};

type Props = {
  pairs: PairSource[];
};

/**
 * PopularComparisons renders a row of pre-built "head-to-head" tiles, each
 * linking to /compare?ids=A,B. Pairs are derived dynamically from rankings
 * by the caller so we don't go stale when ASINs change.
 */
export function PopularComparisons({ pairs }: Props) {
  // Filter to pairs that actually have 2 items.
  const valid = pairs.filter((p) => p.items.length >= 2);
  if (valid.length === 0) return null;

  return (
    <div className="panel panel-tight">
      <div className="section-header dashboard-section-head">
        <div>
          <p className="kicker">Quick Picks</p>
          <h2>Popular Comparisons</h2>
        </div>
      </div>
      <p className="muted dashboard-section-lead">
        Head-to-head matchups of top-ranked flashlights. Tap any pair to compare side by side.
      </p>
      <div className="popular-compare-grid">
        {valid.map((pair) => {
          const [a, b] = pair.items;
          const ids = `${a.flashlight.id},${b.flashlight.id}`;
          const nameA = `${a.flashlight.brand} ${a.flashlight.name}`;
          const nameB = `${b.flashlight.brand} ${b.flashlight.name}`;
          return (
            <Link
              key={pair.label}
              href={`/compare?ids=${ids}`}
              className="popular-compare-tile"
              aria-label={`Compare ${nameA} versus ${nameB}`}
            >
              <p className="kicker popular-compare-tile-kicker">{pair.label}</p>
              <div className="popular-compare-tile-row">
                <div className="popular-compare-tile-cell">
                  <div className="popular-compare-tile-image">
                    <ImageWithFallback src={a.flashlight.image_url} alt={nameA} />
                  </div>
                  <p className="popular-compare-tile-name">{nameA}</p>
                </div>
                <div className="popular-compare-tile-vs" aria-hidden>vs</div>
                <div className="popular-compare-tile-cell">
                  <div className="popular-compare-tile-image">
                    <ImageWithFallback src={b.flashlight.image_url} alt={nameB} />
                  </div>
                  <p className="popular-compare-tile-name">{nameB}</p>
                </div>
              </div>
              <p className="muted popular-compare-tile-desc">{pair.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
