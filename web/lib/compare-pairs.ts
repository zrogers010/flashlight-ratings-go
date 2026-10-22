import { fetchAllSlugs } from "./api";

export type ComparePair = {
  a: string;
  b: string;
  slug: string;
};

// Use overall_score (rounded) to match rankings display
function overallScoreRounded(item: { 
  overall_score?: number;
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
}) {
  return Math.round(item.overall_score || 0);
}

let cachedPairs: ComparePair[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

/**
 * Returns the curated set of compare pairs (top 10 × top 10).
 * Results are cached in-memory for 1 hour.
 * Used by sitemap, generateStaticParams, and the noindex check.
 */
export async function curatedComparePairs(): Promise<ComparePair[]> {
  const now = Date.now();
  
  // Return cached result if fresh
  if (cachedPairs && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedPairs;
  }

  try {
    const slugs = await fetchAllSlugs();
    
    // If API is unreachable and we have no stale cache
    if (!slugs || slugs.length === 0) {
      if (cachedPairs) {
        console.warn('curatedComparePairs: API returned no data, using stale cache');
        return cachedPairs;
      }
      // Only throw when REQUIRE_COMPARE_PAIRS=1 (in-container rebuild)
      if (process.env.REQUIRE_COMPARE_PAIRS === '1') {
        throw new Error('curatedComparePairs: Cannot fetch slugs and no cache available');
      }
      // Otherwise, return empty array for graceful fallback during image build
      console.warn('curatedComparePairs: Cannot fetch slugs, returning empty array');
      return [];
    }
    
    // Filter out unscored/incomplete products (score <= 0) before taking top 10
    const scored = slugs.filter((s) => s.slug && overallScoreRounded(s) > 0);
    const top10 = scored.slice(0, 10);
    const pairs: ComparePair[] = [];

    for (let i = 0; i < top10.length; i++) {
      for (let j = i + 1; j < top10.length; j++) {
        const [a, b] = [top10[i].slug, top10[j].slug].sort();
        pairs.push({ a, b, slug: `${a}-vs-${b}` });
      }
    }

    cachedPairs = pairs;
    cacheTimestamp = now;
    return pairs;
  } catch (err) {
    // On error, return stale cache if available
    if (cachedPairs) {
      console.warn('curatedComparePairs: Error fetching data, using stale cache:', err);
      return cachedPairs;
    }
    // Only throw when REQUIRE_COMPARE_PAIRS=1 (in-container rebuild)
    if (process.env.REQUIRE_COMPARE_PAIRS === '1') {
      console.error('curatedComparePairs: Failed to fetch data and no cache available');
      throw err;
    }
    // Otherwise, return empty array for graceful fallback during image build
    console.warn('curatedComparePairs: Error fetching data, returning empty array');
    return [];
  }
}

/**
 * Check if a compare slug (e.g. "a-vs-b") is in the curated set.
 */
export async function isInCuratedSet(slug: string): Promise<boolean> {
  const pairs = await curatedComparePairs();
  return pairs.some((p) => p.slug === slug);
}
