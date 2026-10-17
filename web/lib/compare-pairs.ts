import { fetchAllSlugs } from "./api";

export type ComparePair = {
  a: string;
  b: string;
  slug: string;
};

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
    const top10 = slugs.filter((s) => s.slug).slice(0, 10);
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
  } catch {
    // On error, return stale cache if available
    if (cachedPairs) {
      return cachedPairs;
    }
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
