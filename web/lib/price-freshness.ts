export type PriceFreshnessTone = "fresh" | "recent" | "stale" | "unknown";

export type PriceFreshness = {
  tone: PriceFreshnessTone;
  /** Short label for badges / subtext */
  label: string;
  /** True when we should surface a badge on cards (≤24h) */
  showCardBadge: boolean;
};

/**
 * Classify how fresh an Amazon price snapshot is.
 * Labels say "Last checked" — this is when we last refreshed via Rainforest,
 * not a live Amazon verification.
 * - fresh: ≤24h
 * - recent: ≤7d
 * - stale: >7d
 */
export function getPriceFreshness(iso?: string | null): PriceFreshness | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const ms = Date.now() - then;
  if (ms < 0) {
    return { tone: "fresh", label: "Last checked just now", showCardBadge: true };
  }

  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    return { tone: "fresh", label: "Last checked just now", showCardBadge: true };
  }
  if (hours < 24) {
    return {
      tone: "fresh",
      label: `Last checked ${hours}h ago`,
      showCardBadge: true,
    };
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return { tone: "recent", label: "Last checked yesterday", showCardBadge: false };
  }
  if (days <= 7) {
    return {
      tone: "recent",
      label: `Last checked ${days} days ago`,
      showCardBadge: false,
    };
  }

  return {
    tone: "stale",
    label: `Price may be outdated · last checked ${days} days ago`,
    showCardBadge: false,
  };
}
