package catalog

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

type Catalog struct {
	Products []Product `yaml:"products"`
}

type Product struct {
	Brand        string  `yaml:"brand"`
	BrandSlug    string  `yaml:"brand_slug"`
	BrandCountry string  `yaml:"brand_country"`
	BrandWebsite string  `yaml:"brand_website"`

	Name        string  `yaml:"name"`
	Slug        string  `yaml:"slug"`
	Code        string  `yaml:"code"`
	Description string  `yaml:"description"`
	ReleaseYear int     `yaml:"release_year"`
	MSRP        float64 `yaml:"msrp_usd"`

	ASIN            string  `yaml:"asin"`
	PriceUSD        float64 `yaml:"price_usd"`
	RatingCount     int     `yaml:"rating_count"`
	AverageRating   float64 `yaml:"average_rating"`
	ManufacturerURL string  `yaml:"manufacturer_url"`

	Images   []Image  `yaml:"images"`
	Specs    Specs    `yaml:"specs"`
	UseCases []string `yaml:"use_cases"`
}

type Image struct {
	URL string `yaml:"url"`
	Alt string `yaml:"alt"`
}

type Specs struct {
	MaxLumens        int     `yaml:"max_lumens"`
	SustainedLumens  int     `yaml:"sustained_lumens"`
	MaxCandela       int     `yaml:"max_candela"`
	BeamDistanceM    int     `yaml:"beam_distance_m"`
	RuntimeHighMin   int     `yaml:"runtime_high_min"`
	Runtime500Min    int     `yaml:"runtime_500_min"`
	TurboStepdownSec int     `yaml:"turbo_stepdown_sec"`
	BeamPattern      string  `yaml:"beam_pattern"`
	BatteryType      string  `yaml:"battery_type"`
	RechargeType     string  `yaml:"recharge_type"`
	BatteryReplaceable *bool `yaml:"battery_replaceable"`

	WeightG        float64 `yaml:"weight_g"`
	LengthMM       float64 `yaml:"length_mm"`
	HeadDiameterMM float64 `yaml:"head_diameter_mm"`
	BodyDiameterMM float64 `yaml:"body_diameter_mm"`

	SwitchType        string  `yaml:"switch_type"`
	WaterproofRating  string  `yaml:"waterproof_rating"`
	ImpactResistanceM float64 `yaml:"impact_resistance_m"`
	BodyMaterial      string  `yaml:"body_material"`
	LEDModel          string  `yaml:"led_model"`
	CRI               int     `yaml:"cri"`

	HasStrobe          *bool `yaml:"has_strobe"`
	HasMemoryMode      *bool `yaml:"has_memory_mode"`
	HasLockout         *bool `yaml:"has_lockout"`
	HasMoonlightMode   *bool `yaml:"has_moonlight_mode"`
	HasMagneticTailcap *bool `yaml:"has_magnetic_tailcap"`
	HasPocketClip      *bool `yaml:"has_pocket_clip"`
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func ParseFile(path string) (*Catalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read catalog file: %w", err)
	}

	var cat Catalog
	if err := yaml.Unmarshal(data, &cat); err != nil {
		return nil, fmt.Errorf("parse catalog YAML: %w", err)
	}

	for i := range cat.Products {
		p := &cat.Products[i]
		p.Brand = strings.TrimSpace(p.Brand)
		p.Name = strings.TrimSpace(p.Name)
		if p.BrandSlug == "" {
			p.BrandSlug = makeSlug(p.Brand)
		}
		if p.Slug == "" {
			p.Slug = makeSlug(p.Brand + "-" + p.Name)
		}
		p.BrandSlug = strings.Trim(p.BrandSlug, "-")
		p.Slug = strings.Trim(p.Slug, "-")
		p.BrandCountry = strings.ToUpper(strings.TrimSpace(p.BrandCountry))
		p.ASIN = strings.ToUpper(strings.TrimSpace(p.ASIN))
		p.Description = strings.TrimSpace(p.Description)
	}

	return &cat, nil
}

func (c *Catalog) Validate() []string {
	var warnings []string
	slugs := map[string]bool{}
	for i, p := range c.Products {
		label := fmt.Sprintf("[%d] %s %s", i, p.Brand, p.Name)
		if p.Brand == "" {
			warnings = append(warnings, label+": missing brand")
		}
		if p.Name == "" {
			warnings = append(warnings, label+": missing name")
		}
		if p.ASIN == "" {
			warnings = append(warnings, label+": missing ASIN")
		}
		if len(p.Images) == 0 {
			warnings = append(warnings, label+": no images")
		}
		if p.Description == "" {
			warnings = append(warnings, label+": missing description")
		}
		if p.PriceUSD == 0 {
			warnings = append(warnings, label+": missing price")
		}
		if p.Specs.MaxLumens == 0 {
			warnings = append(warnings, label+": missing max_lumens")
		}
		if slugs[p.Slug] {
			warnings = append(warnings, label+": duplicate slug "+p.Slug)
		}
		slugs[p.Slug] = true
	}
	return warnings
}

func makeSlug(s string) string {
	return strings.Trim(slugRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
}
