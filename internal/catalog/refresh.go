package catalog

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"gopkg.in/yaml.v3"
)

type RefreshConfig struct {
	Concurrency    int
	RequestDelay   time.Duration
	AmazonTimeout  time.Duration
	ImageTimeout   time.Duration
	ScrapeTimeout  time.Duration
	PartnerTag     string
	SkipASINCheck  bool
	SkipImageCheck bool
	SkipScrape     bool
}

func DefaultRefreshConfig() RefreshConfig {
	return RefreshConfig{
		Concurrency:   3,
		RequestDelay:  800 * time.Millisecond,
		AmazonTimeout: 10 * time.Second,
		ImageTimeout:  8 * time.Second,
		ScrapeTimeout: 15 * time.Second,
		PartnerTag:    "flashlightrat-20",
	}
}

type RefreshReport struct {
	Total           int
	ValidASIN       int
	InvalidASIN     int
	ValidImages     int
	BrokenImages    int
	ScrapedImages   int
	Dropped         int
	DroppedProducts []string
	Warnings        []string
}

func (r *RefreshReport) Print() {
	log.Printf("refresh report: %d products checked", r.Total)
	log.Printf("  ASINs:  %d valid, %d invalid", r.ValidASIN, r.InvalidASIN)
	log.Printf("  Images: %d valid, %d broken, %d scraped from manufacturer sites", r.ValidImages, r.BrokenImages, r.ScrapedImages)
	log.Printf("  Dropped: %d products (incomplete after validation)", r.Dropped)
	for _, p := range r.DroppedProducts {
		log.Printf("    - %s", p)
	}
	for _, w := range r.Warnings {
		log.Printf("  WARN: %s", w)
	}
}

type productResult struct {
	index   int
	product Product
	valid   bool
	warning string
}

func Refresh(cat *Catalog, cfg RefreshConfig) (*Catalog, *RefreshReport) {
	report := &RefreshReport{Total: len(cat.Products)}

	client := &http.Client{
		Timeout: cfg.AmazonTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	scrapeClient := &http.Client{Timeout: cfg.ScrapeTimeout}

	sem := make(chan struct{}, cfg.Concurrency)
	var mu sync.Mutex
	results := make([]productResult, len(cat.Products))

	var wg sync.WaitGroup
	for i, p := range cat.Products {
		wg.Add(1)
		go func(idx int, prod Product) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			res := productResult{index: idx, product: prod, valid: true}

			if !cfg.SkipASINCheck && prod.ASIN != "" {
				time.Sleep(cfg.RequestDelay)
				ok, err := checkASIN(client, prod.ASIN)
				if err != nil {
					// Network/rate-limit errors are not the product's fault
					mu.Lock()
					report.ValidASIN++
					report.Warnings = append(report.Warnings, fmt.Sprintf("%s %s: ASIN check inconclusive: %v", prod.Brand, prod.Name, err))
					mu.Unlock()
				} else if !ok {
					res.valid = false
					res.warning = fmt.Sprintf("%s %s: ASIN %s returned 404 on Amazon", prod.Brand, prod.Name, prod.ASIN)
					mu.Lock()
					report.InvalidASIN++
					mu.Unlock()
				} else {
					mu.Lock()
					report.ValidASIN++
					mu.Unlock()
				}
			} else if prod.ASIN != "" {
				mu.Lock()
				report.ValidASIN++
				mu.Unlock()
			}

			if !cfg.SkipImageCheck {
				validImages := make([]Image, 0, len(prod.Images))
				for _, img := range prod.Images {
					time.Sleep(cfg.RequestDelay / 2)
					if checkImageURL(client, img.URL) {
						validImages = append(validImages, img)
						mu.Lock()
						report.ValidImages++
						mu.Unlock()
					} else {
						mu.Lock()
						report.BrokenImages++
						report.Warnings = append(report.Warnings, fmt.Sprintf("%s %s: broken image %s", prod.Brand, prod.Name, img.URL))
						mu.Unlock()
					}
				}
				res.product.Images = validImages
			}

			if !cfg.SkipScrape && prod.ManufacturerURL != "" {
				time.Sleep(cfg.RequestDelay)
				imgs, err := scrapeManufacturerImages(scrapeClient, prod)
				if err != nil {
					mu.Lock()
					report.Warnings = append(report.Warnings, fmt.Sprintf("%s %s: scrape error: %v", prod.Brand, prod.Name, err))
					mu.Unlock()
				} else if len(imgs) > 0 {
					existingURLs := make(map[string]bool)
					for _, img := range res.product.Images {
						existingURLs[img.URL] = true
					}
					for _, img := range imgs {
						if !existingURLs[img.URL] {
							res.product.Images = append(res.product.Images, img)
							existingURLs[img.URL] = true
							mu.Lock()
							report.ScrapedImages++
							mu.Unlock()
						}
					}
				}
			}

			if res.product.ASIN != "" && len(res.product.Images) == 0 {
				amazonImg := Image{
					URL: fmt.Sprintf("https://images-na.ssl-images-amazon.com/images/P/%s.01._SCLZZZZZZZ_SX500_.jpg", res.product.ASIN),
					Alt: res.product.Brand + " " + res.product.Name,
				}
				res.product.Images = []Image{amazonImg}
			}

			results[idx] = res
		}(i, p)
	}
	wg.Wait()

	var kept []Product
	for _, r := range results {
		if !r.valid {
			report.Dropped++
			report.DroppedProducts = append(report.DroppedProducts, fmt.Sprintf("%s (ASIN: %s)", r.product.Slug, r.product.ASIN))
			continue
		}
		if r.warning != "" && r.valid {
			report.Warnings = append(report.Warnings, r.warning)
		}
		if r.product.ASIN == "" || r.product.PriceUSD == 0 || r.product.Description == "" {
			report.Dropped++
			report.DroppedProducts = append(report.DroppedProducts, fmt.Sprintf("%s (missing required fields)", r.product.Slug))
			continue
		}
		kept = append(kept, r.product)
	}

	return &Catalog{Products: kept}, report
}

func checkASIN(client *http.Client, asin string) (bool, error) {
	url := "https://www.amazon.com/dp/" + asin
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		// Network errors from EC2 are common (Amazon blocks datacenter IPs);
		// don't treat as invalid — the ASIN is probably fine.
		return false, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	// Only a clear 404 means the ASIN doesn't exist.
	// Amazon returns 503, 429, 403, CAPTCHAs from datacenter IPs —
	// all of those mean "we blocked you", not "this product doesn't exist".
	if resp.StatusCode == 404 {
		return false, nil
	}
	return true, nil
}

func checkImageURL(client *http.Client, url string) bool {
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; FlashlightRatingsBot/1.0)")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func scrapeManufacturerImages(client *http.Client, p Product) ([]Image, error) {
	req, err := http.NewRequest("GET", p.ManufacturerURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var images []Image
	seen := make(map[string]bool)
	altBase := p.Brand + " " + p.Name

	ogImage, exists := doc.Find(`meta[property="og:image"]`).Attr("content")
	if exists && ogImage != "" && isProductImage(ogImage) {
		ogImage = resolveURL(p.ManufacturerURL, ogImage)
		if !seen[ogImage] {
			images = append(images, Image{URL: ogImage, Alt: altBase + " product photo"})
			seen[ogImage] = true
		}
	}

	gallerySelectors := []string{
		".product-gallery img",
		".product-images img",
		".product-media img",
		".product__media img",
		".woocommerce-product-gallery img",
		".product-image-gallery img",
		"[data-gallery] img",
		".swiper-slide img",
		".slick-slide img",
		".carousel-item img",
		".product-photo img",
		".product-slider img",
		".main-image img",
		"#product-images img",
	}

	for _, sel := range gallerySelectors {
		doc.Find(sel).Each(func(i int, s *goquery.Selection) {
			imgURL := extractBestImageURL(s)
			if imgURL == "" || !isProductImage(imgURL) {
				return
			}
			imgURL = resolveURL(p.ManufacturerURL, imgURL)
			if seen[imgURL] {
				return
			}
			alt := s.AttrOr("alt", "")
			if alt == "" {
				alt = fmt.Sprintf("%s photo %d", altBase, len(images)+1)
			}
			images = append(images, Image{URL: imgURL, Alt: alt})
			seen[imgURL] = true
		})
	}

	if len(images) < 2 {
		doc.Find("img").Each(func(i int, s *goquery.Selection) {
			if len(images) >= 5 {
				return
			}
			imgURL := extractBestImageURL(s)
			if imgURL == "" || !isProductImage(imgURL) || seen[imgURL] {
				return
			}
			imgURL = resolveURL(p.ManufacturerURL, imgURL)
			width, wExists := s.Attr("width")
			height, hExists := s.Attr("height")
			if wExists && hExists && (width == "1" || height == "1") {
				return
			}
			alt := s.AttrOr("alt", "")
			nameLower := strings.ToLower(p.Name)
			altLower := strings.ToLower(alt)
			srcLower := strings.ToLower(imgURL)
			if strings.Contains(altLower, nameLower) || strings.Contains(srcLower, strings.ReplaceAll(nameLower, " ", "-")) || strings.Contains(srcLower, strings.ReplaceAll(nameLower, " ", "_")) {
				if !seen[imgURL] {
					images = append(images, Image{URL: imgURL, Alt: alt})
					seen[imgURL] = true
				}
			}
		})
	}

	return images, nil
}

func extractBestImageURL(s *goquery.Selection) string {
	for _, attr := range []string{"data-src", "data-lazy-src", "data-zoom-image", "data-large_image", "srcset"} {
		if val, exists := s.Attr(attr); exists && val != "" {
			if attr == "srcset" {
				parts := strings.Split(val, ",")
				if len(parts) > 0 {
					return strings.Fields(strings.TrimSpace(parts[len(parts)-1]))[0]
				}
			}
			return strings.TrimSpace(val)
		}
	}
	return s.AttrOr("src", "")
}

func isProductImage(url string) bool {
	if strings.HasPrefix(url, "data:") {
		return false
	}
	if strings.Contains(url, "R0lGODlh") || strings.Contains(url, "iVBORw0KGgo") {
		return false
	}
	if len(url) < 10 || len(url) > 2000 {
		return false
	}
	lower := strings.ToLower(url)
	skipPatterns := []string{
		"logo", "icon", "favicon", "banner", "badge",
		"payment", "social", "twitter", "facebook",
		"instagram", "youtube", "pinterest", "svg",
		"spacer", "placeholder", "loading", "spinner",
		"1x1", "pixel", "tracking", "analytics",
		"cart", "checkout", "arrow", "close", "search",
		"menu", "nav", "header", "footer",
		"base64", "blank.gif", "blank.png", "transparent",
	}
	for _, pat := range skipPatterns {
		if strings.Contains(lower, pat) {
			return false
		}
	}
	validExts := []string{".jpg", ".jpeg", ".png", ".webp"}
	for _, ext := range validExts {
		if strings.Contains(lower, ext) {
			return true
		}
	}
	return !strings.HasSuffix(lower, ".svg") && !strings.HasSuffix(lower, ".gif")
}

func resolveURL(base, href string) string {
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	if strings.HasPrefix(href, "//") {
		return "https:" + href
	}
	baseIdx := strings.Index(base, "//")
	if baseIdx < 0 {
		return href
	}
	slashIdx := strings.Index(base[baseIdx+2:], "/")
	if slashIdx < 0 {
		return base + "/" + strings.TrimPrefix(href, "/")
	}
	origin := base[:baseIdx+2+slashIdx]
	if strings.HasPrefix(href, "/") {
		return origin + href
	}
	lastSlash := strings.LastIndex(base, "/")
	return base[:lastSlash+1] + href
}

func WriteCatalog(path string, cat *Catalog) error {
	data, err := yaml.Marshal(cat)
	if err != nil {
		return fmt.Errorf("marshal catalog: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}
