package rainforest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SyncState is a sidecar JSON file that tracks per-ASIN sync metadata
// across runs of `rainforest-sync`. It records how many consecutive sync
// runs an ASIN has come back as unavailable so the legacy
// --prune-unavailable=N flag can soft-disable its offer without deleting it.
//
// The state file lives next to the CSV (e.g. data/manual_catalog.csv ->
// data/manual_catalog.sync_state.json) and is intentionally separate from
// the CSV so we don't have to migrate the CSV schema or coordinate with
// the strict-column DB import (`scripts/import-manual-catalog.sh`).
type SyncState struct {
	Version   int                        `json:"version"`
	UpdatedAt time.Time                  `json:"updated_at"`
	Entries   map[string]*SyncStateEntry `json:"entries"`
}

type SyncStateEntry struct {
	UnavailableRuns    int       `json:"unavailable_runs"`
	FirstUnavailableAt time.Time `json:"first_unavailable_at,omitempty"`
	LastCheckAt        time.Time `json:"last_check_at"`
	LastBrand          string    `json:"last_brand,omitempty"`
	LastModel          string    `json:"last_model,omitempty"`
	LastReason         string    `json:"last_reason,omitempty"`
}

// StatePathFor returns the conventional sidecar path for a given CSV path.
// Example: data/manual_catalog.csv -> data/manual_catalog.sync_state.json
func StatePathFor(csvPath string) string {
	dir := filepath.Dir(csvPath)
	base := filepath.Base(csvPath)
	stem := strings.TrimSuffix(base, filepath.Ext(base))
	return filepath.Join(dir, stem+".sync_state.json")
}

// LoadState reads the sidecar state file. Returns an empty state (not an
// error) if the file does not yet exist — first runs are expected to bootstrap.
func LoadState(path string) (*SyncState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}, nil
		}
		return nil, fmt.Errorf("read sync state %s: %w", path, err)
	}

	var s SyncState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse sync state %s: %w", path, err)
	}
	if s.Entries == nil {
		s.Entries = map[string]*SyncStateEntry{}
	}
	if s.Version == 0 {
		s.Version = 1
	}
	return &s, nil
}

// Save atomically writes the state file. Pretty-printed for human review.
func (s *SyncState) Save(path string) error {
	s.UpdatedAt = time.Now().UTC()
	if s.Version == 0 {
		s.Version = 1
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal sync state: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write sync state: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename sync state: %w", err)
	}
	return nil
}

// MarkUnavailable increments the unavailable streak for an ASIN. The first
// call (streak transitions 0 -> 1) records FirstUnavailableAt.
func (s *SyncState) MarkUnavailable(asin, brand, model, reason string) {
	if asin == "" {
		return
	}
	now := time.Now().UTC()
	e, ok := s.Entries[asin]
	if !ok {
		e = &SyncStateEntry{}
		s.Entries[asin] = e
	}
	if e.UnavailableRuns == 0 {
		e.FirstUnavailableAt = now
	}
	e.UnavailableRuns++
	e.LastCheckAt = now
	e.LastBrand = brand
	e.LastModel = model
	e.LastReason = reason
}

// MarkAvailable resets the unavailable streak to 0. We keep the entry
// around (with a fresh LastCheckAt) so the state file documents that we
// have actively checked this ASIN, but the streak is zeroed.
func (s *SyncState) MarkAvailable(asin, brand, model string) {
	if asin == "" {
		return
	}
	now := time.Now().UTC()
	e, ok := s.Entries[asin]
	if !ok {
		e = &SyncStateEntry{}
		s.Entries[asin] = e
	}
	e.UnavailableRuns = 0
	e.FirstUnavailableAt = time.Time{}
	e.LastCheckAt = now
	e.LastBrand = brand
	e.LastModel = model
	e.LastReason = ""
}

// ASINsUnavailableFor returns ASINs whose unavailable streak is >= threshold.
func (s *SyncState) ASINsUnavailableFor(threshold int) []string {
	if threshold < 1 {
		return nil
	}
	var out []string
	for asin, e := range s.Entries {
		if e != nil && e.UnavailableRuns >= threshold {
			out = append(out, asin)
		}
	}
	return out
}

// Prune drops keys we no longer care about (entries for ASINs that are no
// longer present in the CSV at all). Call this at the end of a sync to
// keep the state file from growing unbounded.
func (s *SyncState) GarbageCollect(keepASINs map[string]bool) int {
	removed := 0
	for asin := range s.Entries {
		if !keepASINs[asin] {
			delete(s.Entries, asin)
			removed++
		}
	}
	return removed
}
