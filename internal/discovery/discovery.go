// Package discovery grows the flashlight catalog by searching the Amazon
// Creators API for new listings from brands already vetted in the catalog,
// applying a quality gate (brand allowlist, in-stock offer, ratings
// thresholds), and emitting candidate rows in manual_catalog.csv format.
package discovery

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"flashlight-ratings-go/internal/amazon"
	"flashlight-ratings-go/internal/rainforest"
)

// Searcher is satisfied by *amazon.CreatorsClient.
type Searcher interface {
	SearchItems(ctx context.Context, q amazon.SearchQuery) ([]amazon.Product, error)
}

// RatingsLookup is satisfied by *rainforest.Client. Used to verify candidate
// ratings when the Creators API withholds customerReviews.
type RatingsLookup interface {
	LookupProduct(ctx context.Context, asin string) (*rainforest.ProductResult, error)
}

// Category pairs a search phrase with the use_case_tags value candidates
// found through it will carry.
type Category struct {
	Tag      string
	Keywords string
}

// DefaultCategories mirrors the site's scoring profiles plus a couple of
// adjacent niches worth cataloging.
var DefaultCategories = []Category{
	{Tag: "edc", Keywords: "EDC flashlight"},
	{Tag: "tactical", Keywords: "tactical flashlight"},
	{Tag: "throw", Keywords: "long throw flashlight"},
	{Tag: "flood", Keywords: "flood flashlight high lumen"},
	{Tag: "keychain", Keywords: "keychain flashlight"},
	{Tag: "headlamp", Keywords: "rechargeable headlamp"},
}

// BrandInfo carries the catalog's brand metadata so candidate rows are
// complete without manual editing.
type BrandInfo struct {
	Name        string
	Slug        string
	CountryCode string
	WebsiteURL  string
}

type Config struct {
	Search  Searcher
	Ratings RatingsLookup // optional; used when search results carry no ratings

	Brands        []BrandInfo
	ExistingASINs map[string]bool
	Categories    []Category

	MaxPerSearch   int     // itemCount per search; default 10
	MinRating      float64 // default 4.3
	MinRatingCount int     // default 150
	PartnerTag     string
}

type Candidate struct {
	Brand       BrandInfo
	ASIN        string
	ParentASIN  string
	Title       string
	ModelName   string
	Price       float64
	Rating      float64
	RatingCount int
	ImageURL    string
	Features    []string
	Tags        []string
	FoundAt     time.Time
}

type Report struct {
	Candidates []Candidate
	Searches   int
	Considered int
	Rejected   map[string]int
	Errors     int
}

// Run executes the brand x category search matrix and returns quality-gated
// candidates. Results seen through multiple categories are merged (their tag
// lists accumulate).
func Run(ctx context.Context, cfg Config) (*Report, error) {
	if cfg.Search == nil {
		return nil, fmt.Errorf("discovery: search client is required")
	}
	if cfg.MaxPerSearch <= 0 {
		cfg.MaxPerSearch = 10
	}
	if cfg.MinRating <= 0 {
		cfg.MinRating = 4.3
	}
	if cfg.MinRatingCount <= 0 {
		cfg.MinRatingCount = 150
	}
	if len(cfg.Categories) == 0 {
		cfg.Categories = DefaultCategories
	}

	report := &Report{Rejected: map[string]int{}}
	byASIN := map[string]*Candidate{}
	seenParents := map[string]bool{}
	// ratingsCache avoids paying twice for the same ASIN surfacing in two
	// category searches.
	ratingsCache := map[string]*rainforest.ProductResult{}

	for _, brand := range cfg.Brands {
		for _, cat := range cfg.Categories {
			report.Searches++
			results, err := cfg.Search.SearchItems(ctx, amazon.SearchQuery{
				Keywords:  cat.Keywords,
				Brand:     brand.Name,
				ItemCount: cfg.MaxPerSearch,
				SortBy:    "AvgCustomerReviews",
			})
			if err != nil {
				log.Printf("search %s x %q failed: %v", brand.Name, cat.Keywords, err)
				report.Errors++
				continue
			}

			for _, p := range results {
				// Merge the category tag into an already-accepted candidate.
				if c, ok := byASIN[p.ASIN]; ok {
					if !contains(c.Tags, cat.Tag) {
						c.Tags = append(c.Tags, cat.Tag)
					}
					continue
				}
				report.Considered++

				reason := gate(ctx, cfg, brand, &p, seenParents, ratingsCache)
				if reason != "" {
					report.Rejected[reason]++
					continue
				}

				c := &Candidate{
					Brand:      brand,
					ASIN:       p.ASIN,
					ParentASIN: p.ParentASIN,
					Title:      p.Title,
					ModelName:  extractModelName(brand.Name, p.Title),
					ImageURL:   p.ImageURL,
					Features:   p.Features,
					Tags:       []string{cat.Tag},
					FoundAt:    time.Now().UTC(),
				}
				if p.OfferPrice != nil {
					c.Price = *p.OfferPrice
				}
				if p.AverageRating != nil {
					c.Rating = *p.AverageRating
				}
				if p.RatingCount != nil {
					c.RatingCount = *p.RatingCount
				}
				if rp := ratingsCache[p.ASIN]; rp != nil && c.Rating == 0 {
					c.Rating = rp.Rating
					c.RatingCount = rp.RatingsTotal
				}

				byASIN[p.ASIN] = c
				if p.ParentASIN != "" {
					seenParents[p.ParentASIN] = true
				}
			}
		}
	}

	for _, c := range byASIN {
		report.Candidates = append(report.Candidates, *c)
	}
	sort.Slice(report.Candidates, func(i, j int) bool {
		a, b := report.Candidates[i], report.Candidates[j]
		if a.Brand.Name != b.Brand.Name {
			return a.Brand.Name < b.Brand.Name
		}
		return a.RatingCount > b.RatingCount
	})
	return report, nil
}

// gate returns "" when the product passes the quality gate, otherwise a
// short rejection reason for the report.
func gate(
	ctx context.Context,
	cfg Config,
	brand BrandInfo,
	p *amazon.Product,
	seenParents map[string]bool,
	ratingsCache map[string]*rainforest.ProductResult,
) string {
	if p.ASIN == "" {
		return "missing asin"
	}
	// Brand allowlist: keyword-stuffed knockoffs surface in brand searches;
	// the byLineInfo brand must actually match.
	if normalizeBrand(p.Brand) != normalizeBrand(brand.Name) {
		return "brand mismatch"
	}
	if cfg.ExistingASINs[p.ASIN] {
		return "already in catalog"
	}
	if p.ParentASIN != "" && (cfg.ExistingASINs[p.ParentASIN] || seenParents[p.ParentASIN]) {
		return "variant of known product"
	}
	if p.OfferPrice == nil || *p.OfferPrice <= 0 || !amazon.AvailabilityInStock(p.Availability) {
		return "no purchasable offer"
	}

	rating, count := 0.0, 0
	if p.AverageRating != nil {
		rating = *p.AverageRating
	}
	if p.RatingCount != nil {
		count = *p.RatingCount
	}
	if rating == 0 && cfg.Ratings != nil {
		rp, ok := ratingsCache[p.ASIN]
		if !ok {
			var err error
			rp, err = cfg.Ratings.LookupProduct(ctx, p.ASIN)
			if err != nil {
				log.Printf("ratings check for %s failed: %v", p.ASIN, err)
				return "ratings unavailable"
			}
			ratingsCache[p.ASIN] = rp
		}
		rating = rp.Rating
		count = rp.RatingsTotal
	}
	if rating == 0 {
		return "ratings unavailable"
	}
	if rating < cfg.MinRating {
		return fmt.Sprintf("rating below %.1f", cfg.MinRating)
	}
	if count < cfg.MinRatingCount {
		return fmt.Sprintf("fewer than %d ratings", cfg.MinRatingCount)
	}
	return ""
}

func normalizeBrand(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "-", "")
	return s
}

// extractModelName strips the brand prefix and marketing tail from an Amazon
// listing title, leaving a short model-ish name. Best effort — candidates are
// reviewed before import.
func extractModelName(brandName, title string) string {
	t := strings.TrimSpace(title)
	if idx := indexFold(t, brandName); idx == 0 {
		t = strings.TrimSpace(t[len(brandName):])
	}
	for _, sep := range []string{",", " - ", " – ", " | ", "("} {
		if idx := strings.Index(t, sep); idx > 0 {
			t = t[:idx]
		}
	}
	t = strings.TrimSpace(t)
	words := strings.Fields(t)
	if len(words) > 5 {
		words = words[:5]
	}
	return strings.Join(words, " ")
}

func indexFold(s, sub string) int {
	return strings.Index(strings.ToLower(s), strings.ToLower(sub))
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// PrintReport writes a human-readable summary to stdout.
func PrintReport(report *Report) {
	fmt.Println()
	fmt.Println(strings.Repeat("=", 80))
	fmt.Println("DISCOVERY REPORT (Creators API)")
	fmt.Println(strings.Repeat("=", 80))
	fmt.Printf("Searches run: %d | Listings considered: %d | Candidates: %d | Errors: %d\n",
		report.Searches, report.Considered, len(report.Candidates), report.Errors)
	if len(report.Rejected) > 0 {
		reasons := make([]string, 0, len(report.Rejected))
		for r := range report.Rejected {
			reasons = append(reasons, r)
		}
		sort.Strings(reasons)
		fmt.Println("Rejections:")
		for _, r := range reasons {
			fmt.Printf("  %-28s %d\n", r, report.Rejected[r])
		}
	}
	fmt.Println()
	for _, c := range report.Candidates {
		fmt.Printf("  %-12s %-14s %-40s $%-8.2f %.1f* (%d ratings) tags=%s\n",
			c.ASIN, c.Brand.Name, truncateTitle(c.ModelName, 40), c.Price, c.Rating, c.RatingCount,
			strings.Join(c.Tags, ","))
	}
	fmt.Println()
}

func truncateTitle(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
