package rainforest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// DailyBudget tracks Rainforest API request usage across sync runs to enforce
// a hard daily ceiling. The budget resets at midnight UTC.
// Uses POSIX file locking (flock) for cross-process atomic budget reservation.
type DailyBudget struct {
	mu         sync.Mutex
	path       string
	lockPath   string
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
// Uses cross-process file locking to ensure budget is enforced across
// concurrent/overlapping sync processes.
func NewDailyBudget(statePath string, maxPerDay int) (*DailyBudget, error) {
	if maxPerDay < 0 {
		return nil, fmt.Errorf("maxPerDay must be >= 0, got %d", maxPerDay)
	}
	
	b := &DailyBudget{
		path:       statePath,
		lockPath:   statePath + ".lock",
		maxPerDay:  maxPerDay,
		date:       todayUTC(),
		used:       0,
		saveOnIncr: true,
	}
	
	if err := b.load(); err != nil {
		// File not found is OK (first run), other errors fail closed
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("load budget state (fail-closed on corrupt/unreadable): %w", err)
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
// Uses cross-process file locking to atomically reserve quota.
// Retries lock acquisition up to 3 times with exponential backoff.
// Fails closed if state file is corrupt or unreadable.
func (b *DailyBudget) Increment(n int) error {
	if n < 0 {
		return fmt.Errorf("increment must be >= 0, got %d", n)
	}
	if n == 0 {
		return nil
	}
	
	// In-process mutex to serialize concurrent goroutines
	b.mu.Lock()
	defer b.mu.Unlock()
	
	// Cross-process file lock for atomic budget reservation
	const maxRetries = 3
	var lockErr error
	for retry := 0; retry < maxRetries; retry++ {
		if retry > 0 {
			backoff := time.Duration(50<<uint(retry-1)) * time.Millisecond
			time.Sleep(backoff)
		}
		lockErr = b.acquireLockAndIncrement(n)
		if lockErr == nil {
			return nil
		}
		// Retry on lock contention or I/O errors, but not on budget exhausted
		if isBudgetExhausted(lockErr) {
			return lockErr
		}
	}
	
	return fmt.Errorf("increment failed after %d retries: %w", maxRetries, lockErr)
}

func (b *DailyBudget) acquireLockAndIncrement(n int) error {
	// Ensure lock directory exists
	if err := os.MkdirAll(filepath.Dir(b.lockPath), 0755); err != nil {
		return fmt.Errorf("create lock directory: %w", err)
	}
	
	// Open/create lock file
	lockFile, err := os.OpenFile(b.lockPath, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return fmt.Errorf("open lock file: %w", err)
	}
	defer lockFile.Close()
	
	// Acquire exclusive lock (blocks if another process holds it)
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX); err != nil {
		return fmt.Errorf("acquire exclusive lock: %w", err)
	}
	defer syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN)
	
	// Reload state from disk to get cross-process updates
	if err := b.loadUnlocked(); err != nil {
		if !os.IsNotExist(err) {
			// Fail closed on corrupt/unreadable state
			return fmt.Errorf("load budget state (fail-closed): %w", err)
		}
		// First run - state file doesn't exist yet
	}
	
	// Check if date rolled over (new day UTC)
	today := todayUTC()
	if today != b.date {
		b.date = today
		b.used = 0
	}
	
	// Check if increment would exceed budget
	if b.maxPerDay > 0 && b.used+n > b.maxPerDay {
		return &budgetExhaustedError{
			used:      b.used,
			maxPerDay: b.maxPerDay,
			requested: n,
		}
	}
	
	b.used += n
	
	// Save atomically while holding lock
	if err := b.saveUnlocked(); err != nil {
		// I/O error on save is critical - fail closed to prevent overspend
		return fmt.Errorf("save budget state (fail-closed): %w", err)
	}
	
	return nil
}

type budgetExhaustedError struct {
	used      int
	maxPerDay int
	requested int
}

func (e *budgetExhaustedError) Error() string {
	return fmt.Sprintf("daily budget exhausted: %d/%d used, cannot add %d",
		e.used, e.maxPerDay, e.requested)
}

func isBudgetExhausted(err error) bool {
	_, ok := err.(*budgetExhaustedError)
	return ok
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
	return b.loadUnlocked()
}

func (b *DailyBudget) loadUnlocked() error {
	data, err := os.ReadFile(b.path)
	if err != nil {
		return err
	}
	
	var state budgetState
	if err := json.Unmarshal(data, &state); err != nil {
		// Fail closed on corrupt state
		return fmt.Errorf("unmarshal budget state (corrupt): %w", err)
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
