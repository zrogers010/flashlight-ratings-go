// Editorial-team identity used for E-E-A-T (Experience, Expertise,
// Authority, Trust) signals on review pages and Article schema.
//
// We deliberately attribute content at the organization level rather than
// to an individual person. Google's product reviews / helpful-content
// guidance accepts an Organization as a valid `author`, and this keeps
// the operator's personal identity out of every page on the site.
//
// All Article/Review schema, the byline component, and the publisher
// metadata pull from this single config so attribution stays consistent.

const SITE_URL = process.env.SITE_URL || "https://flashlightratings.com";

export type Author = {
  // Display name used in the visible byline. Written as a complete phrase
  // (e.g. "FlashlightRatings Editorial Team") so it reads naturally on a
  // single line and after a "By the …" prefix.
  name: string;
  // Stable URL for the schema's @id field. Uses the homepage anchor since
  // the editorial team is the site itself; no separate /about page needed.
  url: string;
};

export const SITE_AUTHOR: Author = {
  name: "FlashlightRatings Editorial Team",
  url: `${SITE_URL}/#editorial`,
};

// editorialOrgSchema returns the JSON-LD Organization object representing
// the editorial team. Embedded inside Article/Review schema as the
// `author` (Schema.org allows Organization-typed authors). The site-wide
// publisher Organization is declared separately in the root layout.
export function editorialOrgSchema(author: Author = SITE_AUTHOR) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${author.url}#org`,
    name: author.name,
    url: author.url,
  };
}
