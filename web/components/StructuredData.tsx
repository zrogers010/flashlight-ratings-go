import type { FlashlightDetail } from "@/lib/api";

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

  if (data.price_usd !== undefined && data.amazon_url) {
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
