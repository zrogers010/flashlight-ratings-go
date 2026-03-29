package rainforest

import (
	"context"
	"fmt"
	"log"
	"strings"
)

type DiscoveryResult struct {
	Brand      string
	NewItems   []SearchResult
	ExistingN  int
	SearchedN  int
}

type DiscoveryReport struct {
	Brands     []DiscoveryResult
	TotalNew   int
	TotalExist int
	Errors     int
}

// Discover searches Amazon for each brand's top flashlight listings and
// reports which ASINs are not yet in the catalog.
func Discover(ctx context.Context, client *Client, brands []string, existingASINs map[string]bool, maxPerBrand int) *DiscoveryReport {
	if maxPerBrand <= 0 {
		maxPerBrand = 10
	}

	report := &DiscoveryReport{}

	for _, brand := range brands {
		log.Printf("Searching Amazon for \"%s flashlight\" (bestsellers)...", brand)

		results, err := client.SearchBrand(ctx, brand, maxPerBrand)
		if err != nil {
			log.Printf("  ERROR searching %s: %v", brand, err)
			report.Errors++
			continue
		}

		dr := DiscoveryResult{
			Brand:     brand,
			SearchedN: len(results),
		}

		for _, sr := range results {
			if existingASINs[sr.ASIN] {
				dr.ExistingN++
				report.TotalExist++
			} else {
				dr.NewItems = append(dr.NewItems, sr)
				report.TotalNew++
			}
		}

		report.Brands = append(report.Brands, dr)
		log.Printf("  Found %d results, %d new, %d already in catalog", len(results), len(dr.NewItems), dr.ExistingN)
	}

	return report
}

// PrintReport writes the discovery report to stdout in a readable format.
func PrintReport(report *DiscoveryReport) {
	fmt.Println()
	fmt.Println(strings.Repeat("=", 80))
	fmt.Println("DISCOVERY REPORT")
	fmt.Println(strings.Repeat("=", 80))
	fmt.Printf("Total new products found: %d (across %d brands)\n", report.TotalNew, len(report.Brands))
	fmt.Printf("Already in catalog: %d\n", report.TotalExist)
	if report.Errors > 0 {
		fmt.Printf("Search errors: %d\n", report.Errors)
	}
	fmt.Println()

	for _, dr := range report.Brands {
		if len(dr.NewItems) == 0 {
			fmt.Printf("--- %s: no new products (searched %d, %d already listed) ---\n\n", dr.Brand, dr.SearchedN, dr.ExistingN)
			continue
		}

		fmt.Printf("=== %s (%d new products found) ===\n", strings.ToUpper(dr.Brand), len(dr.NewItems))
		for i, item := range dr.NewItems {
			priceStr := "N/A"
			if item.Price > 0 {
				priceStr = fmt.Sprintf("$%.2f", item.Price)
			}

			ratingStr := "no ratings"
			if item.RatingsTotal > 0 {
				ratingStr = fmt.Sprintf("%.1f* (%s ratings)", item.Rating, formatRatingCount(item.RatingsTotal))
			}

			primeTag := ""
			if item.IsPrime {
				primeTag = " [PRIME]"
			}

			fmt.Printf("  %d. %-12s %-50s %8s  %s%s\n",
				i+1,
				item.ASIN,
				truncateTitle(item.Title, 50),
				priceStr,
				ratingStr,
				primeTag,
			)
		}
		fmt.Println()
	}
}

func formatRatingCount(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprintf("%d", n)
}

func truncateTitle(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
