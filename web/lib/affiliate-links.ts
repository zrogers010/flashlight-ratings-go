/**
 * Multi-merchant affiliate link builder.
 * Supports Amazon, Olight (Awin), and Fenix (AvantLink).
 */

export type MerchantConfig = {
  amazon?: {
    tag: string; // e.g. "flashlightrat-20"
  };
  awin?: {
    publisherId: string; // e.g. "12345"
    olightMerchantId: string; // e.g. "67890"
  };
  avantlink?: {
    websiteId: string; // e.g. "abcd1234"
    fenixMerchantId: string; // e.g. "10123"
  };
};

export type Merchant = 'amazon' | 'olight' | 'fenix';

export type MerchantOffer = {
  merchant: Merchant;
  label: string;
  url: string;
  commissionRate: number; // percentage, e.g. 10 = 10%
  cookieDays: number;
  isPrimary: boolean;
};

/**
 * Build the affiliate link for a product.
 * Returns undefined if the merchant is not configured.
 */
export function buildAffiliateLink(
  merchant: Merchant,
  productUrl: string | undefined | null,
  config: MerchantConfig
): string | undefined {
  if (!productUrl) return undefined;

  switch (merchant) {
    case 'amazon':
      // Amazon: use stored URL as-is (already contains tag=flashlightrat-20)
      // Only override the tag if NEXT_PUBLIC_AMAZON_TAG is explicitly set at build time
      if (config.amazon?.tag) {
        const amazonUrl = new URL(productUrl.startsWith('http') ? productUrl : `https://${productUrl}`);
        amazonUrl.searchParams.set('tag', config.amazon.tag);
        return amazonUrl.toString();
      }
      // No tag configured: return stored URL unchanged
      return productUrl.startsWith('http') ? productUrl : `https://${productUrl}`;

    case 'olight':
      if (!config.awin?.publisherId || !config.awin?.olightMerchantId) return undefined;
      // Awin deep link format
      // https://www.awin1.com/cread.php?awinmid=MERCHANT_ID&awinaffid=PUBLISHER_ID&ued=PRODUCT_URL
      const olightEncoded = encodeURIComponent(productUrl);
      return `https://www.awin1.com/cread.php?awinmid=${config.awin.olightMerchantId}&awinaffid=${config.awin.publisherId}&ued=${olightEncoded}`;

    case 'fenix':
      if (!config.avantlink?.websiteId || !config.avantlink?.fenixMerchantId) return undefined;
      // AvantLink deep link format per https://www.avantlink.com/support/article/anatomy-of-an-affiliate-tracking-link
      // Format: https://www.avantlink.com/click.php?tt=cl&merchant_id=UUID&website_id=UUID&url=PRODUCT_URL
      const fenixEncoded = encodeURIComponent(productUrl);
      return `https://www.avantlink.com/click.php?tt=cl&merchant_id=${config.avantlink.fenixMerchantId}&website_id=${config.avantlink.websiteId}&url=${fenixEncoded}`;

    default:
      return undefined;
  }
}

/**
 * Get merchant offers for a flashlight.
 * Amazon is primary by default; brand-direct stores shown as secondary links.
 */
export function getProductOffers(
  brand: string,
  amazonUrl: string | undefined | null,
  manufacturerUrl: string | undefined | null,
  config: MerchantConfig
): MerchantOffer[] {
  const offers: MerchantOffer[] = [];
  const brandLower = brand.toLowerCase();

  // Amazon (primary by default when available)
  const amazonLink = buildAffiliateLink('amazon', amazonUrl, config);
  if (amazonLink) {
    offers.push({
      merchant: 'amazon',
      label: 'Amazon',
      url: amazonLink,
      commissionRate: 3,
      cookieDays: 1,
      isPrimary: true, // Amazon is primary
    });
  }

  // Olight via Awin (secondary)
  if (brandLower === 'olight' && manufacturerUrl) {
    const olightLink = buildAffiliateLink('olight', manufacturerUrl, config);
    if (olightLink) {
      offers.push({
        merchant: 'olight',
        label: 'Olight Store',
        url: olightLink,
        commissionRate: 10,
        cookieDays: 30,
        isPrimary: false,
      });
    }
  }

  // Fenix via AvantLink (secondary)
  if (brandLower === 'fenix' && manufacturerUrl) {
    const fenixLink = buildAffiliateLink('fenix', manufacturerUrl, config);
    if (fenixLink) {
      offers.push({
        merchant: 'fenix',
        label: 'Fenix Store',
        url: fenixLink,
        commissionRate: 7,
        cookieDays: 60,
        isPrimary: false,
      });
    }
  }

  return offers;
}

/**
 * Load merchant config from environment variables.
 * Returns a config object with only the configured merchants.
 * 
 * IMPORTANT: NEXT_PUBLIC_* values are baked in at build time.
 * Changes to these env vars require rebuilding the Next.js app.
 */
export function getMerchantConfig(): MerchantConfig {
  const config: MerchantConfig = {};

  // Amazon tag (optional - stored URLs already contain tag=flashlightrat-20)
  const amazonTag = process.env.NEXT_PUBLIC_AMAZON_TAG;
  if (amazonTag) {
    config.amazon = { tag: amazonTag };
  }

  // Awin (Olight)
  const awinPublisherId = process.env.NEXT_PUBLIC_AWIN_PUBLISHER_ID;
  const awinOlightMerchantId = process.env.NEXT_PUBLIC_AWIN_OLIGHT_MERCHANT_ID;
  if (awinPublisherId && awinOlightMerchantId) {
    config.awin = {
      publisherId: awinPublisherId,
      olightMerchantId: awinOlightMerchantId,
    };
  }

  // AvantLink (Fenix)
  const avantlinkWebsiteId = process.env.NEXT_PUBLIC_AVANTLINK_WEBSITE_ID;
  const avantlinkFenixMerchantId = process.env.NEXT_PUBLIC_AVANTLINK_FENIX_MERCHANT_ID;
  if (avantlinkWebsiteId && avantlinkFenixMerchantId) {
    config.avantlink = {
      websiteId: avantlinkWebsiteId,
      fenixMerchantId: avantlinkFenixMerchantId,
    };
  }

  return config;
}
