import type { MetadataRoute } from "next";

const BASE_URL = process.env.SITE_URL || "https://flashlightratings.com";

const categories = ["tactical", "edc", "camping", "search-rescue", "survival", "diving", "value", "throw", "flood"];
const guideSlugs = ["how-we-score", "throw-vs-flood", "battery-guide", "runtime-explained", "ip-ratings", "best-edc-weight"];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/best-flashlights`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/flashlights`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE_URL}/compare`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/find-yours`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/brands`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/reviews`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE_URL}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/best-flashlights/under-50`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/best-flashlights/under-100`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE_URL}/best-flashlights/${cat}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.85
  }));

  // Note: /flashlights/[id] is intentionally NOT in the sitemap. Each product
  // has both a /flashlights/[id] page (kept for back-compat / internal navigation)
  // and a /reviews/[slug] page (the canonical, editorial, slug-based URL).
  // Including both would create duplicate-content signals; the numeric-ID page
  // is noindexed and canonicals to its slug review.
  let reviewPages: MetadataRoute.Sitemap = [];
  let vsPages: MetadataRoute.Sitemap = [];
  let brandPages: MetadataRoute.Sitemap = [];
  const compositePages: MetadataRoute.Sitemap = [];
  try {
    const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const [flashlightsRes, brandsRes] = await Promise.all([
      fetch(`${API_BASE}/flashlights?page=1&page_size=500`, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      }),
      fetch(`${API_BASE}/brands?detail=true`, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      }),
    ]);
    clearTimeout(timeout);

    if (flashlightsRes.ok) {
      const data = await flashlightsRes.json();
      const items: { id: number; slug: string }[] = data.items || [];
      reviewPages = items
        .filter((item) => item.slug)
        .map((item) => ({
          url: `${BASE_URL}/reviews/${item.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.85
        }));

      // Generate vs-pages for the top-30 by listing position (post-scoring sort).
      // 30 x 30 with i<j = 435 pairs, slug-based for SEO. Google won't crawl them
      // all but having them in the sitemap signals which combos to prioritize.
      const top = items.slice(0, 30).filter((i) => i.slug);
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          vsPages.push({
            url: `${BASE_URL}/compare/${top[i].slug}-vs-${top[j].slug}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.65
          });
        }
      }
    }

    if (brandsRes.ok) {
      const brands: { slug: string }[] = await brandsRes.json();
      brandPages = brands.map((b) => ({
        url: `${BASE_URL}/brands/${b.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));

      // Composite-filter landing pages: brand × use_case, use_case × budget,
      // use_case × battery. These cover high-intent long-tail queries like
      // "best fenix tactical flashlight" and "best edc flashlight under $100".
      const compositeUseCases = ["tactical", "edc", "camping", "search-rescue", "survival", "diving"];
      const compositeBudgets = [50, 75, 100, 150, 200];
      const compositeBatteries = ["18650", "21700"];
      for (const brand of brands) {
        for (const uc of compositeUseCases) {
          compositePages.push({
            url: `${BASE_URL}/best-flashlights/${brand.slug}-${uc}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.7,
          });
        }
      }
      for (const uc of compositeUseCases) {
        for (const budget of compositeBudgets) {
          compositePages.push({
            url: `${BASE_URL}/best-flashlights/${uc}-under-${budget}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.75,
          });
        }
        for (const battery of compositeBatteries) {
          compositePages.push({
            url: `${BASE_URL}/best-flashlights/${uc}-${battery}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.7,
          });
        }
      }
    }
  } catch {
    // API unavailable — static pages still generated; products added on next revalidation
  }

  const guidePages: MetadataRoute.Sitemap = guideSlugs.map((slug) => ({
    url: `${BASE_URL}/guides/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7
  }));

  return [
    ...staticPages,
    ...categoryPages,
    ...compositePages,
    ...guidePages,
    ...brandPages,
    ...reviewPages,
    ...vsPages,
  ];
}
