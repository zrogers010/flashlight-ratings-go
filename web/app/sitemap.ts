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

  let productPages: MetadataRoute.Sitemap = [];
  let vsPages: MetadataRoute.Sitemap = [];
  try {
    const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}/flashlights?page=1&page_size=500`, {
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const items: { id: number }[] = data.items || [];
      productPages = items.map((item) => ({
        url: `${BASE_URL}/flashlights/${item.id}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.8
      }));

      const topIds = items.slice(0, 10).map((i) => i.id);
      for (let i = 0; i < topIds.length; i++) {
        for (let j = i + 1; j < topIds.length; j++) {
          vsPages.push({
            url: `${BASE_URL}/compare/${topIds[i]}-vs-${topIds[j]}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.7
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

  return [...staticPages, ...categoryPages, ...guidePages, ...productPages, ...vsPages];
}
