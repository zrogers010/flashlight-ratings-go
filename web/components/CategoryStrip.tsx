import Link from "next/link";
import { FlashlightCard } from "./FlashlightCard";
import type { RankingItem, FlashlightItem } from "@/lib/api";

type Props = {
  title: string;
  kicker?: string;
  description?: string;
  viewAllHref: string;
  viewAllLabel?: string;
  items: RankingItem[];
};

function rankingItemToFlashlightItem(item: RankingItem, profile: string): FlashlightItem {
  const f = item.flashlight;
  const base: FlashlightItem = {
    id: f.id,
    brand: f.brand,
    name: f.name,
    slug: f.slug,
    image_url: f.image_url,
    amazon_url: f.amazon_url,
    max_lumens: f.max_lumens,
    beam_distance_m: f.beam_distance_m,
    waterproof_rating: f.waterproof_rating,
    price_usd: f.price_usd,
  };
  // Preserve the profile-specific score on the relevant field so
  // FlashlightCard's bestScore() picks it up and ScoreBadge displays it.
  switch (profile) {
    case "tactical":
      base.tactical_score = item.score;
      break;
    case "edc":
      base.edc_score = item.score;
      break;
    case "value":
      base.value_score = item.score;
      break;
    case "throw":
      base.throw_score = item.score;
      break;
    case "flood":
      base.flood_score = item.score;
      break;
    default:
      base.overall_score = item.score;
  }
  return base;
}

export function CategoryStrip({
  title,
  kicker,
  description,
  viewAllHref,
  viewAllLabel = "View all",
  items,
}: Props) {
  if (!items || items.length === 0) return null;

  // Infer profile from the first item (all items in a strip share a profile).
  const profile = items[0].profile;

  return (
    <div className="panel panel-tight category-strip-panel">
      <div className="section-header dashboard-section-head">
        <div>
          {kicker ? <p className="kicker">{kicker}</p> : null}
          <h2>{title}</h2>
        </div>
        <Link href={viewAllHref} className="category-strip-view-all">
          {viewAllLabel} →
        </Link>
      </div>
      {description ? (
        <p className="muted dashboard-section-lead">{description}</p>
      ) : null}
      <div className="category-strip">
        {items.map((item) => (
          <div key={item.flashlight.id} className="category-strip-item">
            <FlashlightCard
              item={rankingItemToFlashlightItem(item, profile)}
              rank={item.rank}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
