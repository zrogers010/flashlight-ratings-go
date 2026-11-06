package rainforest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// DailyBudget tracks Rainforest API request usage across sync runs to enforce
// a hard daily ceiling. The budget resets at midnight UTC.
type DailyBudget struct {
	mu         sync.Mutex
	path       string
	maxPerDay  int
	date       string // YYYY-MM-DD UTC
	used       int
	saveOnIncr bool
}

type budgetState struct {
	Date string `json:"date"`
	Used int    `json:"used"`
}

// NewDailyBudget creates or loads a daily budget tracker. maxPerDay is the
// hard ceiling; 0 means unlimited.
func NewDailyBudget(statePath string, maxPerDay int) (*DailyBudget, error) {
	if maxPerDay < 0 {
		return nil, fmt.Errorf("maxPerDay must be >= 0, got %d", maxPerDay)
	}
	
	b := &DailyBudget{
		path:       statePath,
		maxPerDay:  maxPerDay,
		date:       todayUTC(),
		used:       0,
		saveOnIncr: true,
	}
	
	if err := b.load(); err != nil {
		// File not found is OK (first run), other errors fail
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("load budget state: %w", err)
		}
	}
	
	return b, nil
}

// Available returns the number of requests remaining today. Returns -1 if unlimited.
func (b *DailyBudget) Available() int {
	if b.maxPerDay == 0 {
		return -1
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	remaining := b.maxPerDay - b.used
	if remaining < 0 {
		return 0
	}
	return remaining
}

// Increment records N requests used. Returns error if budget exhausted.
func (b *DailyBudget) Increment(n int) error {
	if n < 0 {
		return fmt.Errorf("increment must be >= 0, got %d", n)
	}
	if n == 0 {
		return nil
	}
	
	b.mu.Lock()
	defer b.mu.Unlock()
	
	// Check if date rolled over (new day UTC)
	today := todayUTC()
	if today != b.date {
		b.date = today
		b.used = 0
	}
	
	// Check if increment would exceed budget
	if b.maxPerDay > 0 && b.used+n > b.maxPerDay {
		return fmt.Errorf("daily budget exhausted: %d/%d used, cannot add %d", 
			b.used, b.maxPerDay, n)
	}
	
	b.used += n
	
	if b.saveOnIncr {
		if err := b.saveUnlocked(); err != nil {
			// Log but don't fail the sync - budget tracking is best-effort
			// to avoid blocking catalog refreshes on I/O errors
			fmt.Fprintf(os.Stderr, "WARNING: failed to save budget state: %v\n", err)
		}
	}
	
	return nil
}

// Used returns the number of requests used today.
func (b *DailyBudget) Used() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.used
}

// Reset resets the daily counter (for testing only).
func (b *DailyBudget) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.used = 0
	b.date = todayUTC()
}

func (b *DailyBudget) load() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	
	data, err := os.ReadFile(b.path)
	if err != nil {
		return err
	}
	
	var state budgetState
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}
	
	today := todayUTC()
	if state.Date == today {
		b.used = state.Used
	} else {
		// Stale state from previous day - start fresh
		b.used = 0
	}
	b.date = today
	
	return nil
}

func (b *DailyBudget) saveUnlocked() error {
	state := budgetState{
		Date: b.date,
		Used: b.used,
	}
	
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	
	// Ensure directory exists
	dir := filepath.Dir(b.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	
	// Write atomically via temp file + rename
	tmp := b.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	
	return os.Rename(tmp, b.path)
}

// Save persists the current budget state to disk.
func (b *DailyBudget) Save() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.saveUnlocked()
}

func todayUTC() string {
	return time.Now().UTC().Format("2006-01-02")
}

// BudgetPathFor returns the standard budget state path for a catalog CSV.
func BudgetPathFor(csvPath string) string {
	dir := filepath.Dir(csvPath)
	base := filepath.Base(csvPath)
	return filepath.Join(dir, "."+base+".rainforest_budget.json")
}
