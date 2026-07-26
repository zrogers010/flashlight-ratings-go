package discovery

import (
	"encoding/csv"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// LoadBrandInfo reads the catalog's brand metadata (name, slug, country,
// website) so candidate rows inherit it. One entry per unique brand, first
// row wins.
func LoadBrandInfo(csvPath string) ([]BrandInfo, error) {
	records, err := readCSV(csvPath)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []BrandInfo
	for i := 1; i < len(records); i++ {
		row := records[i]
		if len(row) < 4 {
			continue
		}
		name := strings.TrimSpace(row[0])
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, BrandInfo{
			Name:        name,
			Slug:        strings.TrimSpace(row[1]),
			CountryCode: strings.TrimSpace(row[2]),
			WebsiteURL:  strings.TrimSpace(row[3]),
		})
	}
	return out, nil
}

// CandidatesPathFor returns the conventional candidates file path for a
// catalog. Example: data/manual_catalog.csv -> data/discovery_candidates.csv
func CandidatesPathFor(catalogPath string) string {
	dir := "."
	if idx := strings.LastIndex(catalogPath, "/"); idx >= 0 {
		dir = catalogPath[:idx]
	}
	return dir + "/discovery_candidates.csv"
}

// WriteCandidatesCSV writes candidates to a standalone file sharing the
// catalog's exact header, ready for human review and later merge.
func WriteCandidatesCSV(candidatesPath, catalogPath, partnerTag string, candidates []Candidate) error {
	header, err := catalogHeader(catalogPath)
	if err != nil {
		return err
	}
	records := [][]string{header}
	for _, c := range candidates {
		records = append(records, candidateRow(header, c, partnerTag))
	}
	return writeCSV(candidatesPath, records)
}

// AppendToCatalog appends candidate rows directly to the live catalog CSV.
func AppendToCatalog(catalogPath, partnerTag string, candidates []Candidate) error {
	records, err := readCSV(catalogPath)
	if err != nil {
		return err
	}
	if len(records) == 0 {
		return fmt.Errorf("catalog %s is empty", catalogPath)
	}
	header := records[0]
	for _, c := range candidates {
		records = append(records, candidateRow(header, c, partnerTag))
	}
	return writeCSV(catalogPath, records)
}

// candidateRow emits a row in header order so column drift in the catalog
// can't silently corrupt output.
func candidateRow(header []string, c Candidate, partnerTag string) []string {
	specs := extractSpecs(c.Title, c.Features)

	amazonURL := fmt.Sprintf("https://www.amazon.com/dp/%s", c.ASIN)
	if partnerTag != "" {
		amazonURL += "?tag=" + partnerTag
	}

	values := map[string]string{
		"brand_name":                     c.Brand.Name,
		"brand_slug":                     c.Brand.Slug,
		"brand_country_code":             c.Brand.CountryCode,
		"brand_website_url":              c.Brand.WebsiteURL,
		"model_name":                     c.ModelName,
		"model_slug":                     c.Brand.Slug + "-" + slugify(c.ModelName),
		"description":                    buildDescription(c.Features),
		"asin":                           c.ASIN,
		"amazon_url":                     amazonURL,
		"current_price_usd":              formatPrice(c.Price),
		"amazon_rating_count":            strconv.Itoa(c.RatingCount),
		"amazon_average_rating":          strconv.FormatFloat(c.Rating, 'f', -1, 64),
		"image_url":                      c.ImageURL,
		"use_case_tags":                  strings.Join(c.Tags, ","),
		"amazon_purchasable":             "true",
		"amazon_availability_checked_at": c.FoundAt.Format(time.RFC3339),
	}
	for k, v := range specs {
		values[k] = v
	}

	row := make([]string, len(header))
	for i, col := range header {
		row[i] = values[strings.TrimSpace(col)]
	}
	return row
}

var (
	lumensRe   = regexp.MustCompile(`(?i)\b(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:high[- ])?lumens?\b`)
	beamRe     = regexp.MustCompile(`(?i)\b(\d{2,4})\s*m(?:eters?)?\b[^.]{0,30}?(?:beam|throw)|(?:beam|throw)[^.0-9]{0,30}?(\d{2,4})\s*m(?:eters?)?\b`)
	ipRatingRe = regexp.MustCompile(`(?i)\bIPX?-?\d{1,2}\b`)
)

// batteryTypes is ordered most-specific-first so e.g. "AAA" wins over "AA".
var batteryTypes = []string{"21700", "18650", "18350", "16340", "14500", "CR123A", "AAA", "AA"}

// extractSpecs pulls the spec values that reliably appear in flashlight
// listing titles and feature bullets. Everything else is left for manual
// review — the scoring engine needs real specs, not guesses.
func extractSpecs(title string, features []string) map[string]string {
	text := title + " " + strings.Join(features, " ")
	out := map[string]string{}

	// Highest lumen figure mentioned is almost always the turbo/max output.
	maxLumens := 0
	for _, m := range lumensRe.FindAllStringSubmatch(text, -1) {
		n, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", ""))
		if err == nil && n > maxLumens && n <= 200000 {
			maxLumens = n
		}
	}
	if maxLumens > 0 {
		out["max_lumens"] = strconv.Itoa(maxLumens)
	}

	if m := beamRe.FindStringSubmatch(text); m != nil {
		v := m[1]
		if v == "" {
			v = m[2]
		}
		out["beam_distance_m"] = v
	}

	upper := strings.ToUpper(text)
	for _, bt := range batteryTypes {
		if strings.Contains(upper, bt) {
			out["battery_type"] = strings.ToLower(bt)
			if bt == "AA" || bt == "AAA" || bt == "CR123A" {
				out["battery_type"] = bt
			}
			break
		}
	}

	lower := strings.ToLower(text)
	if strings.Contains(lower, "usb-c") || strings.Contains(lower, "usb c") || strings.Contains(lower, "type-c") {
		out["recharge_type"] = "usb-c"
	} else if strings.Contains(lower, "magnetic charg") {
		out["recharge_type"] = "magnetic"
	}

	if m := ipRatingRe.FindString(text); m != "" {
		out["waterproof_rating"] = strings.ToUpper(strings.ReplaceAll(m, "-", ""))
	}

	return out
}

// buildDescription joins the first few feature bullets into a review-ready
// description, capped so the CSV stays readable.
func buildDescription(features []string) string {
	var parts []string
	total := 0
	for _, f := range features {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		parts = append(parts, f)
		total += len(f)
		if len(parts) >= 3 || total > 400 {
			break
		}
	}
	desc := strings.Join(parts, " ")
	if len(desc) > 500 {
		desc = desc[:497] + "..."
	}
	return desc
}

var slugCleanRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugCleanRe.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func formatPrice(v float64) string {
	if v <= 0 {
		return ""
	}
	return strconv.FormatFloat(v, 'f', 2, 64)
}

func catalogHeader(catalogPath string) ([]string, error) {
	records, err := readCSV(catalogPath)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("catalog %s is empty", catalogPath)
	}
	return records[0], nil
}

func readCSV(path string) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	reader := csv.NewReader(f)
	reader.LazyQuotes = true
	return reader.ReadAll()
}

func writeCSV(path string, records [][]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	for _, row := range records {
		if err := w.Write(row); err != nil {
			return err
		}
	}
	w.Flush()
	return w.Error()
}
