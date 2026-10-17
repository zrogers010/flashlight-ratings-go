import { getProductOffers, getMerchantConfig, type MerchantConfig } from '../affiliate-links';

describe('getProductOffers', () => {
  const amazonUrl = 'https://www.amazon.com/dp/B0BGMZ4YNC?tag=flashlightrat-20';
  const olightUrl = 'https://www.olightstore.com/warrior-3s-desert-tan.html';
  const fenixUrl = 'https://www.fenixlighting.com/products/fenix-pd36r-pro-rechargeable-flashlight';

  it('returns Amazon-only when no env vars set', () => {
    const config: MerchantConfig = {}; // No config
    const offers = getProductOffers('Olight', amazonUrl, olightUrl, config);
    
    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe('amazon');
    expect(offers[0].isPrimary).toBe(true);
    expect(offers[0].url).toBe(amazonUrl); // Uses stored URL as-is
  });

  it('returns Amazon + Olight when Awin configured', () => {
    const config: MerchantConfig = {
      awin: {
        publisherId: '12345',
        olightMerchantId: '67890',
      },
    };
    const offers = getProductOffers('Olight', amazonUrl, olightUrl, config);
    
    expect(offers).toHaveLength(2);
    expect(offers[0].merchant).toBe('amazon');
    expect(offers[0].isPrimary).toBe(true);
    expect(offers[1].merchant).toBe('olight');
    expect(offers[1].isPrimary).toBe(false);
    expect(offers[1].url).toContain('awin1.com/cread.php');
    expect(offers[1].url).toContain('awinmid=67890');
    expect(offers[1].url).toContain('awinaffid=12345');
  });

  it('returns Amazon + Fenix when AvantLink configured', () => {
    const config: MerchantConfig = {
      avantlink: {
        websiteId: 'abcd1234',
        fenixMerchantId: '10123',
      },
    };
    const offers = getProductOffers('Fenix', amazonUrl, fenixUrl, config);
    
    expect(offers).toHaveLength(2);
    expect(offers[0].merchant).toBe('amazon');
    expect(offers[0].isPrimary).toBe(true);
    expect(offers[1].merchant).toBe('fenix');
    expect(offers[1].isPrimary).toBe(false);
    // Verify AvantLink uses mi= and pw= parameters
    expect(offers[1].url).toContain('avantlink.com/click.php');
    expect(offers[1].url).toContain('mi=10123');
    expect(offers[1].url).toContain('pw=abcd1234');
  });

  it('returns Amazon + both brand stores when fully configured', () => {
    const config: MerchantConfig = {
      awin: {
        publisherId: '12345',
        olightMerchantId: '67890',
      },
      avantlink: {
        websiteId: 'abcd1234',
        fenixMerchantId: '10123',
      },
    };
    const offers = getProductOffers('Olight', amazonUrl, olightUrl, config);
    
    expect(offers).toHaveLength(2);
    expect(offers[0].merchant).toBe('amazon');
    expect(offers[1].merchant).toBe('olight');
  });

  it('returns only Amazon when manufacturer_url missing', () => {
    const config: MerchantConfig = {
      awin: {
        publisherId: '12345',
        olightMerchantId: '67890',
      },
    };
    const offers = getProductOffers('Olight', amazonUrl, null, config);
    
    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe('amazon');
  });

  it('returns only Amazon for non-Olight/Fenix brands', () => {
    const config: MerchantConfig = {
      awin: {
        publisherId: '12345',
        olightMerchantId: '67890',
      },
      avantlink: {
        websiteId: 'abcd1234',
        fenixMerchantId: '10123',
      },
    };
    const streamlightUrl = 'https://www.streamlight.com/products/detail/protac-hl-x';
    const offers = getProductOffers('Streamlight', amazonUrl, streamlightUrl, config);
    
    expect(offers).toHaveLength(1);
    expect(offers[0].merchant).toBe('amazon');
  });

  it('applies custom Amazon tag when configured', () => {
    const config: MerchantConfig = {
      amazon: {
        tag: 'custom-tag-20',
      },
    };
    const offers = getProductOffers('Generic', amazonUrl, null, config);
    
    expect(offers).toHaveLength(1);
    expect(offers[0].url).toContain('tag=custom-tag-20');
    expect(offers[0].url).not.toContain('tag=flashlightrat-20');
  });
});
