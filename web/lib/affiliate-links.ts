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
      if (!config.amazon?.tag) return undefined;
      // Amazon affiliate links: append ?tag=xxx
      const amazonUrl = new URL(productUrl.startsWith('http') ? productUrl : `https://${productUrl}`);
      amazonUrl.searchParams.set('tag', config.amazon.tag);
      return amazonUrl.toString();

    case 'olight':
      if (!config.awin?.publisherId || !config.awin?.olightMerchantId) return undefined;
      // Awin deep link format
      // https://www.awin1.com/cread.php?awinmid=MERCHANT_ID&awinaffid=PUBLISHER_ID&ued=PRODUCT_URL
      const olightEncoded = encodeURIComponent(productUrl);
      return `https://www.awin1.com/cread.php?awinmid=${config.awin.olightMerchantId}&awinaffid=${config.awin.publisherId}&ued=${olightEncoded}`;

    case 'fenix':
      if (!config.avantlink?.websiteId || !config.avantlink?.fenixMerchantId) return undefined;
      // AvantLink deep link format
      // https://www.avantlink.com/click.php?tt=cl&merchant_id=MERCHANT_ID&website_id=WEBSITE_ID&url=PRODUCT_URL
      const fenixEncoded = encodeURIComponent(productUrl);
      return `https://www.avantlink.com/click.php?tt=cl&merchant_id=${config.avantlink.fenixMerchantId}&website_id=${config.avantlink.websiteId}&url=${fenixEncoded}`;

    default:
      return undefined;
  }
}

/**
 * Get merchant offers for a flashlight.
 * Orders by commission rate descending (best-paying first).
 */
export function getProductOffers(
  brand: string,
  amazonUrl: string | undefined | null,
  manufacturerUrl: string | undefined | null,
  config: MerchantConfig
): MerchantOffer[] {
  const offers: MerchantOffer[] = [];
  const brandLower = brand.toLowerCase();

  // Amazon (always available)
  const amazonLink = buildAffiliateLink('amazon', amazonUrl, config);
  if (amazonLink) {
    offers.push({
      merchant: 'amazon',
      label: 'Amazon',
      url: amazonLink,
      commissionRate: 3,
      cookieDays: 1,
      isPrimary: false, // will be overridden if it's the best
    });
  }

  // Olight via Awin
  if (brandLower === 'olight' && manufacturerUrl) {
    const olightLink = buildAffiliateLink('olight', manufacturerUrl, config);
    if (olightLink) {
      offers.push({
        merchant: 'olight',
        label: 'Olight Direct',
        url: olightLink,
        commissionRate: 10,
        cookieDays: 30,
        isPrimary: false,
      });
    }
  }

  // Fenix via AvantLink
  if (brandLower === 'fenix' && manufacturerUrl) {
    const fenixLink = buildAffiliateLink('fenix', manufacturerUrl, config);
    if (fenixLink) {
      offers.push({
        merchant: 'fenix',
        label: 'Fenix Direct',
        url: fenixLink,
        commissionRate: 7,
        cookieDays: 60,
        isPrimary: false,
      });
    }
  }

  // Sort by commission rate descending
  offers.sort((a, b) => b.commissionRate - a.commissionRate);

  // Mark the highest-paying as primary
  if (offers.length > 0) {
    offers[0].isPrimary = true;
  }

  return offers;
}

/**
 * Load merchant config from environment variables.
 * Returns a config object with only the configured merchants.
 */
export function getMerchantConfig(): MerchantConfig {
  const config: MerchantConfig = {};

  // Amazon
  const amazonTag = process.env.NEXT_PUBLIC_AMAZON_TAG || process.env.AMAZON_PARTNER_TAG;
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
