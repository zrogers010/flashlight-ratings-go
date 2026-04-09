type Props = {
  amazon_url?: string;
  price_usd?: number;
  size?: "sm" | "lg";
  priceUpdatedAt?: string;
};

function freshness(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Price verified just now";
  if (hours < 24) return `Price verified ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Price verified yesterday";
  if (days <= 7) return `Price verified ${days} days ago`;
  return null;
}

export function BuyOnAmazonButton({ amazon_url, price_usd, size = "sm", priceUpdatedAt }: Props) {
  if (!amazon_url) return <span className="badge">Unavailable</span>;

  const safeHref =
    amazon_url.startsWith("http://") || amazon_url.startsWith("https://")
      ? amazon_url
      : `https://${amazon_url}`;

  const fresh = freshness(priceUpdatedAt);

  return (
    <span className="buy-amazon-wrap">
      <a
        className={`buy-amazon-btn ${size === "lg" ? "buy-amazon-lg" : ""}`}
        href={safeHref}
        target="_blank"
        rel="nofollow sponsored noopener noreferrer"
      >
        {price_usd !== undefined && price_usd > 0 && (
          <span className="buy-amazon-price">
            ${price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
        <span>Buy on Amazon</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
      {size === "lg" && fresh && (
        <span className="buy-amazon-freshness muted">{fresh}</span>
      )}
    </span>
  );
}
