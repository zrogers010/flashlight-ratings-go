// Composite-filter slug parser for /best-flashlights/[category].
//
// The /best-flashlights/[category] route serves two URL shapes:
//   1. Single-word category slugs (e.g. /best-flashlights/tactical) — handled
//      by the existing `categoryMap` in page.tsx with hand-written copy.
//   2. Composite filter slugs (e.g. /best-flashlights/olight-edc-under-100) —
//      parsed here into a structured filter set, then rendered by a generic
//      composite page in page.tsx.
//
// The composite slug grammar (tokens separated by '-'):
//   - "under-N" / "over-N"   → max/min price (one each, anywhere in slug)
//   - one of USE_CASE_TOKENS → use_case filter
//   - one of BATTERY_TOKENS  → battery_type filter
//   - any other token        → assumed to be a brand slug; validated against
//                              the known brand list at parse time.
//
// To avoid duplicate-content (olight-edc and edc-olight resolving to the
// same filter set), the canonical URL is always recomposed in a fixed order
// via composeCompositeSlug() and emitted as alternates.canonical. Off-canonical
// hits still render but link equity is consolidated on the canonical form.

export type CompositeFilter = {
  brandName?: string;       // raw brand display name (e.g. "Olight")
  brandSlug?: string;       // brand slug (e.g. "olight")
  useCase?: string;         // tactical | edc | camping | ...
  batteryType?: string;     // 18650 | 21700 | cr123a | aa | aaa
  maxPrice?: number;        // from "under-N"
  minPrice?: number;        // from "over-N"
};

const USE_CASE_TOKENS: Record<string, string> = {
  tactical: "Tactical",
  edc: "EDC",
  camping: "Camping & Outdoors",
  "search-rescue": "Search & Rescue",
  survival: "Survival",
  diving: "Diving",
  value: "Value",
  throw: "Throw",
  flood: "Flood",
};

const BATTERY_TOKENS: Record<string, string> = {
  "18650": "18650",
  "21700": "21700",
  cr123a: "CR123A",
  aa: "AA",
  aaa: "AAA",
};

// MULTI_TOKEN_KEYWORDS: known multi-word tokens that contain hyphens and
// must be re-fused after splitting on "-". Brand slugs that contain hyphens
// (e.g. "cloud-defensive", "princeton-tec") are added dynamically at parse
// time — without them, "cloud-defensive-edc" would tokenize to
// ["cloud","defensive","edc"], fail to match any known brand, and 404.
const MULTI_TOKEN_KEYWORDS = ["search-rescue"];

// Normalize: split on '-', then greedily re-fuse known multi-token keywords.
// So "search-rescue-under-100" tokenizes to ["search-rescue","under","100"]
// and "cloud-defensive-edc" (given the brand keyword) to
// ["cloud-defensive","edc"]. `extraKeywords` carries the hyphenated brand
// slugs. Keywords are matched longest-first so overlapping prefixes resolve
// to the longest valid token.
function tokenize(slug: string, extraKeywords: string[] = []): string[] {
  const keywords = [...MULTI_TOKEN_KEYWORDS, ...extraKeywords]
    .filter((k) => k.includes("-"))
    .sort((a, b) => b.split("-").length - a.split("-").length);
  const parts = slug.split("-");
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    let matched = false;
    for (const keyword of keywords) {
      const kparts = keyword.split("-");
      if (
        i + kparts.length <= parts.length &&
        kparts.every((kp, k) => parts[i + k] === kp)
      ) {
        out.push(keyword);
        i += kparts.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(parts[i]);
      i += 1;
    }
  }
  return out;
}

// parseCompositeFilter returns null when the slug doesn't look like a valid
// composite filter (e.g. it contains tokens we can't classify). brandSlugs is
// the set of valid brand slugs to validate the "anything else" branch against.
export function parseCompositeFilter(
  slug: string,
  brandSlugs: Map<string, string>, // slug -> display name
): CompositeFilter | null {
  if (!slug) return null;
  // Feed hyphenated brand slugs in as multi-token keywords so brands like
  // "cloud-defensive" survive tokenization instead of splitting apart.
  const hyphenatedBrandSlugs = Array.from(brandSlugs.keys()).filter((s) => s.includes("-"));
  const tokens = tokenize(slug.toLowerCase(), hyphenatedBrandSlugs);
  if (tokens.length < 2) {
    // Single-token slugs are handled by the categoryMap, not us. (A bare
    // brand slug should hit /brands/[slug], not /best-flashlights/[brand].)
    return null;
  }

  const filter: CompositeFilter = {};
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t === "under" && i + 1 < tokens.length) {
      const n = parseInt(tokens[i + 1], 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      if (filter.maxPrice !== undefined) return null; // dup
      filter.maxPrice = n;
      i += 2;
      continue;
    }

    if (t === "over" && i + 1 < tokens.length) {
      const n = parseInt(tokens[i + 1], 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      if (filter.minPrice !== undefined) return null;
      filter.minPrice = n;
      i += 2;
      continue;
    }

    if (USE_CASE_TOKENS[t] !== undefined) {
      if (filter.useCase !== undefined) return null;
      filter.useCase = t;
      i += 1;
      continue;
    }

    if (BATTERY_TOKENS[t] !== undefined) {
      if (filter.batteryType !== undefined) return null;
      filter.batteryType = t;
      i += 1;
      continue;
    }

    if (brandSlugs.has(t)) {
      if (filter.brandSlug !== undefined) return null;
      filter.brandSlug = t;
      filter.brandName = brandSlugs.get(t)!;
      i += 1;
      continue;
    }

    // Unrecognized token — bail. The route falls through to notFound() so we
    // don't emit thin landing pages for typos / Google-fed garbage URLs.
    return null;
  }

  // Require at least 2 distinct filter dimensions to count as a real
  // composite slug. A bare "edc" or "olight" should resolve elsewhere.
  const dimensions = [
    filter.brandSlug,
    filter.useCase,
    filter.batteryType,
    filter.maxPrice !== undefined ? "max" : undefined,
    filter.minPrice !== undefined ? "min" : undefined,
  ].filter(Boolean).length;
  if (dimensions < 2) return null;

  return filter;
}

// composeCompositeSlug recomposes a CompositeFilter into the canonical slug
// shape. Order is fixed (brand, use_case, battery, under-N, over-N) so the
// same filter set always produces the same URL — important for canonical
// SEO consolidation.
export function composeCompositeSlug(f: CompositeFilter): string {
  const parts: string[] = [];
  if (f.brandSlug) parts.push(f.brandSlug);
  if (f.useCase) parts.push(f.useCase);
  if (f.batteryType) parts.push(f.batteryType);
  if (f.maxPrice !== undefined) parts.push("under", String(f.maxPrice));
  if (f.minPrice !== undefined) parts.push("over", String(f.minPrice));
  return parts.join("-");
}

// renderCompositeTitle / renderCompositeH1 / renderCompositeDescription
// generate human-readable labels for a parsed filter. Kept as pure functions
// so the page component and the OG image (eventually) can share them.
export function renderCompositeH1(f: CompositeFilter): string {
  const bits: string[] = ["Best"];
  if (f.brandName) bits.push(f.brandName);
  if (f.useCase) bits.push(USE_CASE_TOKENS[f.useCase]);
  bits.push("Flashlights");
  if (f.batteryType) bits.push(`(${BATTERY_TOKENS[f.batteryType]})`);
  if (f.maxPrice !== undefined) bits.push(`Under $${f.maxPrice}`);
  if (f.minPrice !== undefined) bits.push(`Over $${f.minPrice}`);
  return bits.join(" ");
}

export function renderCompositeTitle(f: CompositeFilter): string {
  return `${renderCompositeH1(f)} 2026 — Ranked & Reviewed`;
}

export function renderCompositeDescription(f: CompositeFilter): string {
  const parts: string[] = ["Browse"];
  if (f.brandName) parts.push(`${f.brandName}`);
  if (f.useCase) parts.push(USE_CASE_TOKENS[f.useCase].toLowerCase());
  parts.push("flashlights");
  const constraints: string[] = [];
  if (f.batteryType) constraints.push(`with ${BATTERY_TOKENS[f.batteryType]} batteries`);
  if (f.maxPrice !== undefined) constraints.push(`under $${f.maxPrice}`);
  if (f.minPrice !== undefined) constraints.push(`over $${f.minPrice}`);
  if (constraints.length) parts.push(constraints.join(" "));
  return `${parts.join(" ")} ranked by algorithmic score. Verified specs, real-time Amazon pricing, and side-by-side comparisons.`;
}

// CURATED_COMPOSITE_SEEDS: the slug shapes we want generateStaticParams() to
// build at build time. These map to high-intent, low-competition Google
// queries. Per-brand seeds are generated dynamically from the live brand list
// inside generateStaticParams; these are the static (brand-independent) seeds.
export const CURATED_COMPOSITE_SEEDS = {
  // {use_case}-under-{budget} for popular budget queries.
  budgets: [50, 75, 100, 150, 200],
  // {use_case}-{battery} for cell-format-specific shoppers.
  batteries: ["18650", "21700"],
};

// allUseCases returns the canonical use-case tokens (skipping the
// score-only ones like "value"/"throw"/"flood" that aren't really use
// cases a shopper types into Google).
export function allUseCases(): string[] {
  return ["tactical", "edc", "camping", "search-rescue", "survival", "diving"];
}
