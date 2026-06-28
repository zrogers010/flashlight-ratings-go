// Lightweight GA4 event helpers. gtag is loaded globally in layout.tsx; these
// wrappers no-op safely on the server and when the GA script hasn't loaded
// (e.g. ad blockers), so callers never have to null-check.

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: GtagParams) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(name: string, params: GtagParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

// Conversion-critical: an outbound click to an Amazon affiliate listing.
export function trackAffiliateClick(params: {
  product?: string;
  brand?: string;
  price?: number;
  location: string; // where on the site the click originated
}): void {
  trackEvent("affiliate_click", {
    product: params.product,
    brand: params.brand,
    price: params.price,
    location: params.location,
  });
}
