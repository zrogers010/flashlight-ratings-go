import { getPriceFreshness } from "@/lib/price-freshness";

type Props = {
  amazon_url?: string;
  price_usd?: number;
  size?: "sm" | "lg";
  priceUpdatedAt?: string;
  inStock?: boolean;
  /** Show freshness subtext under the button. Default true. */
  showFreshness?: boolean;
};

export function BuyOnAmazonButton({
  amazon_url,
  price_usd,
  size = "sm",
  priceUpdatedAt,
  inStock,
  showFreshness = true,
}: Props) {
  if (!amazon_url || inStock === false) {
    return <span className="badge">Currently unavailable</span>;
  }

  const safeHref =
    amazon_url.startsWith("http://") || amazon_url.startsWith("https://")
      ? amazon_url
      : `https://${amazon_url}`;

  const fresh = showFreshness ? getPriceFreshness(priceUpdatedAt) : null;

  return (
    <span className={`buy-amazon-wrap${size === "lg" ? " buy-amazon-wrap-lg" : ""}`}>
      <a
        className={`buy-amazon-btn ${size === "lg" ? "buy-amazon-lg" : ""}`}
        href={safeHref}
        target="_blank"
        rel="nofollow sponsored noopener noreferrer"
      >
        {price_usd !== undefined && price_usd > 0 && (
          <span className="buy-amazon-price">
            $
            {price_usd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        )}
        <span>Check Price on Amazon</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
      {fresh && (
        <span
          className={`buy-amazon-freshness buy-amazon-freshness--${fresh.tone}`}
        >
          {fresh.label}
        </span>
      )}
    </span>
  );
}
