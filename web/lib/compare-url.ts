export type CompareLinkItem = {
  id: number;
  slug?: string;
};

/**
 * Return one stable URL for a two-product comparison.
 *
 * Slugs are sorted so A-vs-B and B-vs-A consolidate on the same indexable
 * route. Utility comparisons with 3–4 products continue to use query params.
 */
export function compareUrl(items: CompareLinkItem[]): string {
  if (items.length === 2 && items.every((item) => item.slug)) {
    const [a, b] = items
      .map((item) => item.slug as string)
      .sort();
    return `/compare/${a}-vs-${b}`;
  }

  const ids = items.map((item) => item.id).join(",");
  return `/compare?ids=${encodeURIComponent(ids)}`;
}

export function productUrl(item: CompareLinkItem): string {
  return item.slug ? `/reviews/${item.slug}` : `/flashlights/${item.id}`;
}
