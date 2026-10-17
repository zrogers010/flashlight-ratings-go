import { getPriceFreshness } from "@/lib/price-freshness";
import { getProductOffers, getMerchantConfig, type MerchantOffer } from "@/lib/affiliate-links";

type Props = {
  brand?: string;
  amazon_url?: string;
  manufacturer_url?: string;
  price_usd?: number;
  size?: "sm" | "lg";
  priceUpdatedAt?: string;
  inStock?: boolean;
  /** Show freshness subtext under the button. Default true. */
  showFreshness?: boolean;
};

export function BuyOnAmazonButton({
  brand,
  amazon_url,
  manufacturer_url,
  price_usd,
  size = "sm",
  priceUpdatedAt,
  inStock,
  showFreshness = true,
}: Props) {
  const config = getMerchantConfig();
  const offers = getProductOffers(brand || '', amazon_url, manufacturer_url, config);

  // If no offers, show unavailable
  if (offers.length === 0 || inStock === false) {
    return <span className="badge">Currently unavailable</span>;
  }

  const primaryOffer = offers.find(o => o.isPrimary) || offers[0];
  const secondaryOffers = offers.filter(o => !o.isPrimary);

  const fresh = showFreshness ? getPriceFreshness(priceUpdatedAt) : null;

  return (
    <div className={`buy-offers-wrap${size === "lg" ? " buy-offers-wrap-lg" : ""}`}>
      <span className={`buy-amazon-wrap${size === "lg" ? " buy-amazon-wrap-lg" : ""}`}>
        <a
          className={`buy-amazon-btn ${size === "lg" ? "buy-amazon-lg" : ""}`}
          href={primaryOffer.url}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
        >
          {price_usd !== undefined && price_usd > 0 && primaryOffer.merchant === 'amazon' && (
            <span className="buy-amazon-price">
              $
              {price_usd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
          <span>Check Price on {primaryOffer.label}</span>
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
      
      {secondaryOffers.length > 0 && (
        <div className="alternate-merchants">
          {secondaryOffers.map((offer) => (
            <a
              key={offer.merchant}
              href={offer.url}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              className="alternate-merchant-link"
            >
              {offer.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
