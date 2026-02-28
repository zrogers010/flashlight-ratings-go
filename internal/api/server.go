package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Server struct {
	db *sql.DB
}

func NewServer(db *sql.DB) *Server {
	return &Server{db: db}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/flashlights", s.handleFlashlights)
	mux.HandleFunc("/flashlights/", s.handleFlashlightByID)
	mux.HandleFunc("/compare", s.handleCompare)
	mux.HandleFunc("/rankings", s.handleRankings)
	mux.HandleFunc("/finder", s.handleFinder)
	mux.HandleFunc("/intelligence/runs", s.handleIntelligenceRuns)
	mux.HandleFunc("/intelligence/runs/", s.handleIntelligenceRunByID)
	return mux
}

type apiError struct {
	Error string `json:"error"`
}

type flashlightItem struct {
	ID             int64    `json:"id"`
	Brand          string   `json:"brand"`
	Name           string   `json:"name"`
	Slug           string   `json:"slug"`
	ModelCode      *string  `json:"model_code,omitempty"`
	Description    *string  `json:"description,omitempty"`
	ImageURL       *string  `json:"image_url,omitempty"`
	AmazonURL      *string  `json:"amazon_url,omitempty"`
	MaxLumens      *int64   `json:"max_lumens,omitempty"`
	MaxCandela     *int64   `json:"max_candela,omitempty"`
	BeamDistanceM  *int64   `json:"beam_distance_m,omitempty"`
	RuntimeHighMin *int64   `json:"runtime_high_min,omitempty"`
	Waterproof     *string  `json:"waterproof_rating,omitempty"`
	PriceUSD       *float64 `json:"price_usd,omitempty"`
	TacticalScore  *float64 `json:"tactical_score,omitempty"`
	EDCScore       *float64 `json:"edc_score,omitempty"`
	ValueScore     *float64 `json:"value_score,omitempty"`
	ThrowScore     *float64 `json:"throw_score,omitempty"`
	FloodScore     *float64 `json:"flood_score,omitempty"`
}

type paginatedFlashlightsResponse struct {
	Page      int              `json:"page"`
	PageSize  int              `json:"page_size"`
	Total     int              `json:"total"`
	TotalPage int              `json:"total_pages"`
	Items     []flashlightItem `json:"items"`
}

type flashlightDetail struct {
	flashlightItem
	ReleaseYear         *int64           `json:"release_year,omitempty"`
	MSRPUSD             *float64         `json:"msrp_usd,omitempty"`
	ASIN                *string          `json:"asin,omitempty"`
	WeightG             *float64         `json:"weight_g,omitempty"`
	LengthMM            *float64         `json:"length_mm,omitempty"`
	HeadDiameterMM      *float64         `json:"head_diameter_mm,omitempty"`
	BodyDiameterMM      *float64         `json:"body_diameter_mm,omitempty"`
	ImpactResistance    *float64         `json:"impact_resistance_m,omitempty"`
	SustainedLumens     *int64           `json:"sustained_lumens,omitempty"`
	RuntimeLowMin       *int64           `json:"runtime_low_min,omitempty"`
	RuntimeMediumMin    *int64           `json:"runtime_medium_min,omitempty"`
	RuntimeTurboMin     *int64           `json:"runtime_turbo_min,omitempty"`
	Runtime500Min       *int64           `json:"runtime_500_min,omitempty"`
	TurboStepdownSec    *int64           `json:"turbo_stepdown_sec,omitempty"`
	BeamPattern         *string          `json:"beam_pattern,omitempty"`
	RechargeType        *string          `json:"recharge_type,omitempty"`
	BatteryReplaceable  *bool            `json:"battery_replaceable,omitempty"`
	HasTailSwitch       *bool            `json:"has_tail_switch,omitempty"`
	HasSideSwitch       *bool            `json:"has_side_switch,omitempty"`
	BodyMaterial        *string          `json:"body_material,omitempty"`
	USBCRechargeable    *bool            `json:"usb_c_rechargeable,omitempty"`
	BatteryIncluded     *bool            `json:"battery_included,omitempty"`
	BatteryRech         *bool            `json:"battery_rechargeable,omitempty"`
	HasStrobe           *bool            `json:"has_strobe,omitempty"`
	HasMemoryMode       *bool            `json:"has_memory_mode,omitempty"`
	HasLockout          *bool            `json:"has_lockout,omitempty"`
	HasMoonlightMode    *bool            `json:"has_moonlight_mode,omitempty"`
	HasMagTailcap       *bool            `json:"has_magnetic_tailcap,omitempty"`
	HasPocketClip       *bool            `json:"has_pocket_clip,omitempty"`
	SwitchType          *string          `json:"switch_type,omitempty"`
	LEDModel            *string          `json:"led_model,omitempty"`
	CRI                 *int64           `json:"cri,omitempty"`
	CCTMinK             *int64           `json:"cct_min_k,omitempty"`
	CCTMaxK             *int64           `json:"cct_max_k,omitempty"`
	AmazonRatingCount   *int64           `json:"amazon_rating_count,omitempty"`
	AmazonAverageRating *float64         `json:"amazon_average_rating,omitempty"`
	AmazonLastSyncedAt  *string          `json:"amazon_last_synced_at,omitempty"`
	PriceLastUpdatedAt  *string          `json:"price_last_updated_at,omitempty"`
	Modes               []flashlightMode `json:"modes"`
	ImageURLs           []string         `json:"image_urls"`
	BatteryTypes        []string         `json:"battery_types"`
	UseCaseTags         []string         `json:"use_case_tags"`
}

type flashlightMode struct {
	Name          string `json:"name"`
	OutputLumens  *int64 `json:"output_lumens,omitempty"`
	RuntimeMin    *int64 `json:"runtime_min,omitempty"`
	Candela       *int64 `json:"candela,omitempty"`
	BeamDistanceM *int64 `json:"beam_distance_m,omitempty"`
}

type compareResponse struct {
	Items []flashlightItem `json:"items"`
}

type rankingsResponse struct {
	UseCase   string           `json:"use_case"`
	Page      int              `json:"page"`
	PageSize  int              `json:"page_size"`
	Total     int              `json:"total"`
	TotalPage int              `json:"total_pages"`
	Items     []rankedResponse `json:"items"`
}

type rankedResponse struct {
	Rank       int     `json:"rank"`
	Score      float64 `json:"score"`
	Profile    string  `json:"profile"`
	Flashlight struct {
		ID        int64   `json:"id"`
		Brand     string  `json:"brand"`
		Name      string  `json:"name"`
		Slug      string  `json:"slug"`
		ImageURL  *string `json:"image_url,omitempty"`
		AmazonURL *string `json:"amazon_url,omitempty"`
	} `json:"flashlight"`
}

type finderResponse struct {
	Filters finderFilters   `json:"filters"`
	Items   []finderRanking `json:"items"`
}

type finderFilters struct {
	Budget   *float64 `json:"budget,omitempty"`
	USBC     *bool    `json:"usb_c,omitempty"`
	MinThrow *int64   `json:"min_throw,omitempty"`
}

type finderRanking struct {
	FlashlightID  int64    `json:"flashlight_id"`
	Brand         string   `json:"brand"`
	Name          string   `json:"name"`
	AmazonURL     *string  `json:"amazon_url,omitempty"`
	PriceUSD      *float64 `json:"price_usd,omitempty"`
	BeamDistanceM *int64   `json:"beam_distance_m,omitempty"`
	TacticalScore *float64 `json:"tactical_score,omitempty"`
	ThrowScore    *float64 `json:"throw_score,omitempty"`
	ValueScore    *float64 `json:"value_score,omitempty"`
	FinderScore   float64  `json:"finder_score"`
}

type intelligenceRunRequest struct {
	IntendedUse       string  `json:"intended_use"`
	BudgetUSD         float64 `json:"budget_usd"`
	BatteryPreference string  `json:"battery_preference"`
	SizeConstraint    string  `json:"size_constraint"`
}

type intelligenceRunResult struct {
	ModelID           int64    `json:"model_id"`
	Brand             string   `json:"brand"`
	Name              string   `json:"name"`
	Category          string   `json:"category"`
	ImageURL          *string  `json:"image_url,omitempty"`
	AmazonURL         *string  `json:"amazon_url,omitempty"`
	PriceUSD          *float64 `json:"price_usd,omitempty"`
	MaxLumens         *int64   `json:"max_lumens,omitempty"`
	MaxCandela        *int64   `json:"max_candela,omitempty"`
	BeamDistanceM     *int64   `json:"beam_distance_m,omitempty"`
	RuntimeHighMin    *int64   `json:"runtime_high_min,omitempty"`
	RuntimeMediumMin  *int64   `json:"runtime_medium_min,omitempty"`
	WeightG           *float64 `json:"weight_g,omitempty"`
	LengthMM          *float64 `json:"length_mm,omitempty"`
	WaterproofRating  *string  `json:"waterproof_rating,omitempty"`
	BatteryType       *string  `json:"battery_type,omitempty"`
	OverallScore      float64  `json:"overall_score"`
	UseCaseScore      float64  `json:"use_case_score"`
	BudgetScore       float64  `json:"budget_score"`
	BatteryMatchScore float64  `json:"battery_match_score"`
	SizeFitScore      float64  `json:"size_fit_score"`
	TacticalScore     *float64 `json:"tactical_score,omitempty"`
	EDCScore          *float64 `json:"edc_score,omitempty"`
	ValueScore        *float64 `json:"value_score,omitempty"`
	ThrowScore        *float64 `json:"throw_score,omitempty"`
	FloodScore        *float64 `json:"flood_score,omitempty"`
}

type intelligenceRunResponse struct {
	RunID             int64                   `json:"run_id"`
	CreatedAt         string                  `json:"created_at"`
	IntendedUse       string                  `json:"intended_use"`
	BudgetUSD         float64                 `json:"budget_usd"`
	BatteryPreference string                  `json:"battery_preference"`
	SizeConstraint    string                  `json:"size_constraint"`
	AlgorithmVersion  string                  `json:"algorithm_version"`
	TopResults        []intelligenceRunResult `json:"top_results"`
}

func (s *Server) handleFlashlights(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	page := clamp(parseIntDefault(r.URL.Query().Get("page"), 1), 1, 100000)
	pageSize := clamp(parseIntDefault(r.URL.Query().Get("page_size"), 20), 1, 100)
	filters := flashlightFilters{
		BatteryType: strings.TrimSpace(r.URL.Query().Get("battery_type")),
		IPRating:    strings.TrimSpace(r.URL.Query().Get("ip_rating")),
		SortBy:      strings.TrimSpace(r.URL.Query().Get("sort_by")),
		Order:       strings.TrimSpace(r.URL.Query().Get("order")),
		Page:        page,
		PageSize:    pageSize,
	}

	if min := strings.TrimSpace(r.URL.Query().Get("min_price")); min != "" {
		v, err := strconv.ParseFloat(min, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid min_price"})
			return
		}
		filters.MinPrice = &v
	}
	if max := strings.TrimSpace(r.URL.Query().Get("max_price")); max != "" {
		v, err := strconv.ParseFloat(max, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid max_price"})
			return
		}
		filters.MaxPrice = &v
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	items, total, err := s.listFlashlights(ctx, filters)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to fetch flashlights"})
		return
	}
	totalPages := (total + pageSize - 1) / pageSize
	writeJSON(w, http.StatusOK, paginatedFlashlightsResponse{
		Page:      page,
		PageSize:  pageSize,
		Total:     total,
		TotalPage: totalPages,
		Items:     items,
	})
}

func (s *Server) handleFlashlightByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	idPart := strings.TrimPrefix(r.URL.Path, "/flashlights/")
	idPart = strings.TrimSpace(idPart)
	if idPart == "" || strings.Contains(idPart, "/") {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid flashlight id"})
		return
	}

	id, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid flashlight id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	item, err := s.getFlashlightByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, apiError{Error: "flashlight not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to fetch flashlight"})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}
	ids, err := parseIDList(r.URL.Query().Get("ids"), 20)
	if err != nil || len(ids) == 0 {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "ids must be a comma-separated list of positive integers"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	items, err := s.compareFlashlights(ctx, ids)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to compare flashlights"})
		return
	}
	writeJSON(w, http.StatusOK, compareResponse{Items: items})
}

func (s *Server) handleRankings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	useCase := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("use_case")))
	if useCase == "" {
		useCase = "tactical"
	}
	if !validUseCase(useCase) {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid use_case. expected one of tactical, edc, value, throw, flood"})
		return
	}

	page := clamp(parseIntDefault(r.URL.Query().Get("page"), 1), 1, 100000)
	pageSize := clamp(parseIntDefault(r.URL.Query().Get("page_size"), 20), 1, 100)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	items, total, err := s.rankings(ctx, useCase, page, pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to fetch rankings"})
		return
	}
	totalPages := (total + pageSize - 1) / pageSize
	writeJSON(w, http.StatusOK, rankingsResponse{
		UseCase:   useCase,
		Page:      page,
		PageSize:  pageSize,
		Total:     total,
		TotalPage: totalPages,
		Items:     items,
	})
}

func (s *Server) handleFinder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	var filters finderFilters
	if v := strings.TrimSpace(r.URL.Query().Get("budget")); v != "" {
		p, err := strconv.ParseFloat(v, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid budget"})
			return
		}
		filters.Budget = &p
	}
	if v := strings.TrimSpace(r.URL.Query().Get("usb_c")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid usb_c"})
			return
		}
		filters.USBC = &b
	}
	if v := strings.TrimSpace(r.URL.Query().Get("min_throw")); v != "" {
		m, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid min_throw"})
			return
		}
		filters.MinThrow = &m
	}

	limit := clamp(parseIntDefault(r.URL.Query().Get("limit"), 25), 1, 100)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	items, err := s.finder(ctx, filters, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to run finder"})
		return
	}
	writeJSON(w, http.StatusOK, finderResponse{
		Filters: filters,
		Items:   items,
	})
}

func (s *Server) handleIntelligenceRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	var req intelligenceRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid json body"})
		return
	}

	req.IntendedUse = strings.TrimSpace(strings.ToLower(req.IntendedUse))
	if req.IntendedUse == "" {
		req.IntendedUse = "edc"
	}
	if req.BudgetUSD <= 0 {
		req.BudgetUSD = 80
	}
	req.BatteryPreference = strings.TrimSpace(strings.ToLower(req.BatteryPreference))
	if req.BatteryPreference == "" {
		req.BatteryPreference = "any"
	}
	req.SizeConstraint = strings.TrimSpace(strings.ToLower(req.SizeConstraint))
	if req.SizeConstraint == "" {
		req.SizeConstraint = "any"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := s.createIntelligenceRun(ctx, req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to create intelligence run"})
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleIntelligenceRunByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "method not allowed"})
		return
	}

	idPart := strings.TrimPrefix(r.URL.Path, "/intelligence/runs/")
	idPart = strings.TrimSpace(idPart)
	if idPart == "" || strings.Contains(idPart, "/") {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid run id"})
		return
	}

	id, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "invalid run id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := s.getIntelligenceRunByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, apiError{Error: "intelligence run not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, apiError{Error: "failed to fetch intelligence run"})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func validUseCase(v string) bool {
	switch v {
	case "tactical", "edc", "value", "throw", "flood":
		return true
	default:
		return false
	}
}

func parseIDList(input string, max int) ([]int64, error) {
	if strings.TrimSpace(input) == "" {
		return nil, nil
	}
	parts := strings.Split(input, ",")
	if len(parts) > max {
		return nil, fmt.Errorf("too many ids")
	}
	out := make([]int64, 0, len(parts))
	for _, p := range parts {
		v, err := strconv.ParseInt(strings.TrimSpace(p), 10, 64)
		if err != nil || v <= 0 {
			return nil, fmt.Errorf("invalid id")
		}
		out = append(out, v)
	}
	return out, nil
}

func parseIntDefault(v string, fallback int) int {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	_ = enc.Encode(payload)
}
