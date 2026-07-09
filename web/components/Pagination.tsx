import Link from "next/link";

type Props = {
  currentPage: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
};

// Compact, SEO-friendly pagination. Renders real <a> links (crawlable) with a
// windowed set of page numbers plus first/last so deep pages stay reachable
// without dumping every page number into the DOM.
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const add = (n: number) => out.push(n);
  const span = 1; // pages on each side of current

  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - span && p <= current + span)) {
      add(p);
    } else if (out[out.length - 1] !== "…") {
      out.push("…");
    }
  }
  return out;
}

export function Pagination({ currentPage, totalPages, hrefForPage }: Props) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label="Pagination">
      {currentPage > 1 ? (
        <Link href={hrefForPage(currentPage - 1)} className="pagination-link" rel="prev" aria-label="Previous page">
          ← Prev
        </Link>
      ) : (
        <span className="pagination-link pagination-disabled" aria-disabled="true">← Prev</span>
      )}

      <div className="pagination-pages">
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="pagination-gap" aria-hidden>
              …
            </span>
          ) : p === currentPage ? (
            <span key={p} className="pagination-link pagination-current" aria-current="page">
              {p}
            </span>
          ) : (
            <Link key={p} href={hrefForPage(p)} className="pagination-link" aria-label={`Page ${p}`}>
              {p}
            </Link>
          )
        )}
      </div>

      {currentPage < totalPages ? (
        <Link href={hrefForPage(currentPage + 1)} className="pagination-link" rel="next" aria-label="Next page">
          Next →
        </Link>
      ) : (
        <span className="pagination-link pagination-disabled" aria-disabled="true">Next →</span>
      )}
    </nav>
  );
}
