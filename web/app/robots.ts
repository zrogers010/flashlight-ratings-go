import type { MetadataRoute } from "next";

const BASE_URL = process.env.SITE_URL || "https://flashlightratings.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // Block crawling of arbitrary query-string filter variants on
          // /flashlights and /compare. Every filter combo (use_case, brand,
          // min_price, …) generates a distinct URL that would otherwise
          // compete with the clean /best-flashlights/[category] and
          // /compare/[a]-vs-[b] pages for the same intent. Disallowing the
          // parametric forms concentrates crawl budget + ranking signal on
          // the canonical SEO URLs without breaking user-facing filtering.
          "/flashlights?*",
          "/compare?*",
          "/find-yours?*",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
