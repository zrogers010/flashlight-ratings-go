import type { FlashlightDetail } from "@/lib/api";
import { SITE_AUTHOR, type Author } from "@/lib/author";

const SITE_URL = process.env.SITE_URL || "https://flashlightratings.com";

export function ProductStructuredData({ data }: { data: FlashlightDetail }) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${data.brand} ${data.name}`,
    description: data.description || `${data.brand} ${data.name} flashlight with ${data.max_lumens || "N/A"} lumens.`,
    brand: { "@type": "Brand", name: data.brand },
    category: "Flashlights"
  };

  if (data.image_urls?.length) {
    schema.image = data.image_urls;
  } else if (data.image_url) {
    schema.image = [data.image_url];
  }

  if (data.price_usd !== undefined && data.amazon_url && data.amazon_in_stock !== false) {
    schema.offers = {
      "@type": "Offer",
      price: data.price_usd.toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: data.amazon_url
    };
  }

  if (data.amazon_average_rating && data.amazon_rating_count) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: data.amazon_average_rating.toFixed(1),
      reviewCount: data.amazon_rating_count,
      bestRating: "5",
      worstRating: "1"
    };
  }

  const props = [];
  if (data.max_lumens) props.push({ "@type": "PropertyValue", name: "Max Lumens", value: String(data.max_lumens) });
  if (data.max_candela) props.push({ "@type": "PropertyValue", name: "Max Candela", value: String(data.max_candela) });
  if (data.beam_distance_m) props.push({ "@type": "PropertyValue", name: "Beam Distance", value: `${data.beam_distance_m}m` });
  if (data.weight_g) props.push({ "@type": "PropertyValue", name: "Weight", value: `${data.weight_g}g` });
  if (data.waterproof_rating) props.push({ "@type": "PropertyValue", name: "IP Rating", value: data.waterproof_rating });
  if (props.length) schema.additionalProperty = props;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FAQStructuredData({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ItemListStructuredData({
  items,
  name
}: {
  items: { name: string; url: string; position: number; image?: string; price?: number; available?: boolean }[];
  name: string;
}) {
  if (!items.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item) => {
      const entry: Record<string, unknown> = {
        "@type": "ListItem",
        position: item.position,
        name: item.name,
        url: item.url
      };
      if (item.image) entry.image = item.image;
      if (item.price !== undefined && item.available !== false) {
        entry.item = {
          "@type": "Product",
          name: item.name,
          offers: {
            "@type": "Offer",
            price: item.price.toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock"
          }
        };
      }
      return entry;
    })
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ArticleStructuredData renders schema.org Article (or Review) markup
// with an organization-level author, publish/modified dates, and a
// publisher reference. This carries the E-E-A-T signals Google's product
// reviews update looks for — accountable editorial source + verifiable
// update history — while keeping attribution at the brand level.
//
// Usage: include alongside ProductStructuredData on a /reviews/[slug] page.
// Both schemas can co-exist — Article describes the editorial wrapper,
// Product describes the thing being reviewed.
export function ArticleStructuredData({
  url,
  headline,
  description,
  imageUrls,
  publishedAt,
  updatedAt,
  author = SITE_AUTHOR,
  reviewedItem,
}: {
  url: string;
  headline: string;
  description: string;
  imageUrls?: string[];
  publishedAt?: string;
  updatedAt?: string;
  author?: Author;
  // Optional: when the article is a product review, include the canonical
  // product name so Google can link the Article to the Product entity.
  reviewedItem?: { name: string; brand: string };
}) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": reviewedItem ? "Review" : "Article",
    headline,
    description,
    url,
    author: {
      "@type": "Organization",
      "@id": `${author.url}#org`,
      name: author.name,
      url: author.url,
    },
    publisher: {
      "@type": "Organization",
      name: "FlashlightRatings",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.svg`,
      },
    },
  };

  if (imageUrls && imageUrls.length > 0) schema.image = imageUrls;
  if (publishedAt) schema.datePublished = publishedAt;
  if (updatedAt) schema.dateModified = updatedAt;
  if (reviewedItem) {
    schema.itemReviewed = {
      "@type": "Product",
      name: `${reviewedItem.brand} ${reviewedItem.name}`,
      brand: { "@type": "Brand", name: reviewedItem.brand },
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbStructuredData({ items }: { items: { name: string; href?: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.name,
        ...(item.href ? { item: item.href } : {})
      }))
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
