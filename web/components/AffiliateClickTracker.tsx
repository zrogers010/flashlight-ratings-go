"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// Site-wide outbound-click tracker. Mounted once in the root layout, it uses a
// single delegated capture-phase listener instead of wiring an onClick into
// every BuyOnAmazonButton — that keeps server-rendered HTML small (important
// on pages with 100+ product cards) while still capturing every affiliate
// click for conversion analytics.
//
// All affiliate links are rendered with rel="... sponsored ..." (see
// BuyOnAmazonButton), so we key off that rather than fragile URL matching.
export function AffiliateClickTracker() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const rel = anchor.getAttribute("rel") || "";
      const href = anchor.getAttribute("href") || "";
      const isAffiliate =
        rel.includes("sponsored") || /amazon\.|amzn\.to/i.test(href);
      if (!isAffiliate) return;

      // Pull lightweight context from the nearest labeled ancestor so reports
      // can attribute clicks to a product/section without per-button props.
      const card = anchor.closest("[data-product]") as HTMLElement | null;

      trackEvent("affiliate_click", {
        href,
        product: card?.dataset.product || anchor.getAttribute("data-product") || undefined,
        brand: card?.dataset.brand || undefined,
        location: window.location.pathname,
      });
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
