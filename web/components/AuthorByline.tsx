import { SITE_AUTHOR, type Author } from "@/lib/author";

type Props = {
  author?: Author;
  // Date the article/review was first published (ISO string). Surfaces as
  // "Published Apr 14, 2026" — recency is a real ranking signal for
  // evergreen review content (Google's "Reviewed [date]" rich result).
  publishedAt?: string;
  // Date the article was last meaningfully updated. If omitted but
  // publishedAt is set, we render only "Published".
  updatedAt?: string;
};

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AuthorByline({ author = SITE_AUTHOR, publishedAt, updatedAt }: Props) {
  const published = fmtDate(publishedAt);
  const updated = fmtDate(updatedAt);
  const showBoth = published && updated && published !== updated;

  // Attribution is at the editorial-team / org level (no personal name).
  // The visible byline still gives Google's product-reviews algorithm a
  // human-readable author + dates pair, satisfying the same E-E-A-T signal
  // as a personal byline without exposing an individual operator.
  return (
    <div className="byline">
      <div className="byline-row">
        <span className="byline-prefix">By the </span>
        <span className="byline-author">{author.name}</span>
      </div>
      {(published || updated) && (
        <div className="byline-dates muted">
          {showBoth ? (
            <>
              Published {published} <span aria-hidden>·</span> Updated {updated}
            </>
          ) : updated ? (
            <>Updated {updated}</>
          ) : (
            <>Published {published}</>
          )}
        </div>
      )}
    </div>
  );
}
