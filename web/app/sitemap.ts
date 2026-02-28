import type { MetadataRoute } from "next";

const BASE_URL = process.env.SITE_URL || "https://flashlightratings.com";

const categories = ["tactical", "edc", "camping", "search-rescue", "value", "throw", "flood"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/best-flashlights`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/rankings`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/find-yours`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 }
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE_URL}/best-flashlights/${cat}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.85
  }));

  let productPages: MetadataRoute.Sitemap = [];
  try {
    const API_BASE = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
    const res = await fetch(`${API_BASE}/flashlights?page=1&page_size=500`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      productPages = (data.items || []).map((item: { id: number; slug?: string }) => ({
        url: `${BASE_URL}/flashlights/${item.id}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8
      }));
    }
  } catch {
    // API unavailable during build; product pages will be added on next regeneration
  }

  return [...staticPages, ...categoryPages, ...productPages];
}
