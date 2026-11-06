package rainforest

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDailyBudgetBasics(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	if budget.Available() != 10 {
		t.Errorf("available = %d, want 10", budget.Available())
	}
	if budget.Used() != 0 {
		t.Errorf("used = %d, want 0", budget.Used())
	}
	
	// Use 3 requests
	if err := budget.Increment(3); err != nil {
		t.Fatal(err)
	}
	if budget.Available() != 7 {
		t.Errorf("after 3 used: available = %d, want 7", budget.Available())
	}
	if budget.Used() != 3 {
		t.Errorf("after 3 used: used = %d, want 3", budget.Used())
	}
	
	// Try to exceed budget
	err = budget.Increment(10)
	if err == nil {
		t.Fatal("expected error when exceeding budget")
	}
	if budget.Used() != 3 {
		t.Errorf("after failed increment: used = %d, want 3 (unchanged)", budget.Used())
	}
	
	// Use remaining 7
	if err := budget.Increment(7); err != nil {
		t.Fatal(err)
	}
	if budget.Available() != 0 {
		t.Errorf("after exhaustion: available = %d, want 0", budget.Available())
	}
	
	// Try one more
	err = budget.Increment(1)
	if err == nil {
		t.Fatal("expected error when budget exhausted")
	}
}

func TestDailyBudgetUnlimited(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 0) // 0 = unlimited
	if err != nil {
		t.Fatal(err)
	}
	
	if budget.Available() != -1 {
		t.Errorf("unlimited: available = %d, want -1", budget.Available())
	}
	
	// Should be able to use any amount
	if err := budget.Increment(1000); err != nil {
		t.Errorf("unlimited budget should not fail: %v", err)
	}
	if budget.Used() != 1000 {
		t.Errorf("used = %d, want 1000", budget.Used())
	}
}

func TestDailyBudgetPersistence(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	// First instance uses 5
	b1, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if err := b1.Increment(5); err != nil {
		t.Fatal(err)
	}
	if err := b1.Save(); err != nil {
		t.Fatal(err)
	}
	
	// Second instance should see 5 already used
	b2, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if b2.Used() != 5 {
		t.Errorf("after reload: used = %d, want 5", b2.Used())
	}
	if b2.Available() != 5 {
		t.Errorf("after reload: available = %d, want 5", b2.Available())
	}
	
	// Use 3 more
	if err := b2.Increment(3); err != nil {
		t.Fatal(err)
	}
	
	// Third instance should see 8 total
	b3, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if b3.Used() != 8 {
		t.Errorf("after second reload: used = %d, want 8", b3.Used())
	}
}

func TestDailyBudgetDateRollover(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	// Use 5
	if err := budget.Increment(5); err != nil {
		t.Fatal(err)
	}
	
	// Simulate day rollover by manipulating internal state
	budget.mu.Lock()
	budget.date = "2026-11-05" // yesterday
	budget.mu.Unlock()
	if err := budget.Save(); err != nil {
		t.Fatal(err)
	}
	
	// Reload - should reset because date is stale
	budget2, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if budget2.Used() != 0 {
		t.Errorf("after date rollover: used = %d, want 0 (reset)", budget2.Used())
	}
	if budget2.Available() != 10 {
		t.Errorf("after date rollover: available = %d, want 10", budget2.Available())
	}
}

func TestDailyBudgetMissingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	// Should not error on missing file (first run)
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if budget.Used() != 0 {
		t.Errorf("new budget: used = %d, want 0", budget.Used())
	}
}

func TestDailyBudgetIncrementAutoSaves(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	// Increment (which auto-saves by default)
	if err := budget.Increment(3); err != nil {
		t.Fatal(err)
	}
	
	// Should be persisted immediately
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("budget file not created after increment")
	}
	
	// Reload to verify
	budget2, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if budget2.Used() != 3 {
		t.Errorf("after auto-save reload: used = %d, want 3", budget2.Used())
	}
}

func TestBudgetPathFor(t *testing.T) {
	tests := []struct {
		csvPath string
		want    string
	}{
		{
			csvPath: "data/manual_catalog.csv",
			want:    "data/.manual_catalog.csv.rainforest_budget.json",
		},
		{
			csvPath: "/tmp/test.csv",
			want:    "/tmp/.test.csv.rainforest_budget.json",
		},
	}
	
	for _, tt := range tests {
		got := BudgetPathFor(tt.csvPath)
		if got != tt.want {
			t.Errorf("BudgetPathFor(%q) = %q, want %q", tt.csvPath, got, tt.want)
		}
	}
}

func TestDailyBudgetReset(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	if err := budget.Increment(5); err != nil {
		t.Fatal(err)
	}
	
	budget.Reset()
	
	if budget.Used() != 0 {
		t.Errorf("after reset: used = %d, want 0", budget.Used())
	}
	if budget.Available() != 10 {
		t.Errorf("after reset: available = %d, want 10", budget.Available())
	}
}

func TestDailyBudgetNegativeMax(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	_, err := NewDailyBudget(path, -1)
	if err == nil {
		t.Error("expected error for negative maxPerDay")
	}
}

func TestDailyBudgetZeroIncrement(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	// Zero increment should be no-op
	if err := budget.Increment(0); err != nil {
		t.Errorf("zero increment returned error: %v", err)
	}
	if budget.Used() != 0 {
		t.Errorf("after zero increment: used = %d, want 0", budget.Used())
	}
}

func TestDailyBudgetNegativeIncrement(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	
	err = budget.Increment(-1)
	if err == nil {
		t.Error("expected error for negative increment")
	}
}

// TestDailyBudgetConcurrentAccess verifies thread-safety (basic smoke test).
func TestDailyBudgetConcurrentAccess(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	
	// Disable auto-save for this test to avoid I/O contention
	budget.saveOnIncr = false
	
	// 10 goroutines each increment 5 times
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 5; j++ {
				budget.Increment(1)
			}
			done <- true
		}()
	}
	
	for i := 0; i < 10; i++ {
		<-done
	}
	
	// Should have 50 total (10 goroutines × 5 increments)
	if budget.Used() != 50 {
		t.Errorf("concurrent increments: used = %d, want 50", budget.Used())
	}
}

// TestDailyBudgetCrossProcessLocking verifies cross-process atomic budget reservation.
// Simulates multiple independent processes by creating separate DailyBudget instances
// sharing the same state file and using file locking.
func TestDailyBudgetCrossProcessLocking(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	// Budget allows 50 total requests
	const maxBudget = 50
	const numProcesses = 10
	const incrementsPerProcess = 5
	
	// Launch 10 simulated "processes" (goroutines with independent budget instances)
	errors := make(chan error, numProcesses)
	for i := 0; i < numProcesses; i++ {
		go func() {
			// Each "process" creates its own budget instance
			b, err := NewDailyBudget(path, maxBudget)
			if err != nil {
				errors <- err
				return
			}
			
			// Try to increment 5 times
			for j := 0; j < incrementsPerProcess; j++ {
				if err := b.Increment(1); err != nil {
					errors <- err
					return
				}
			}
			errors <- nil
		}()
	}
	
	// Collect results
	var firstErr error
	for i := 0; i < numProcesses; i++ {
		if err := <-errors; err != nil && firstErr == nil {
			firstErr = err
		}
	}
	
	// Should succeed: 10 processes × 5 requests = 50 (exactly at budget)
	if firstErr != nil {
		t.Fatalf("unexpected error during cross-process increment: %v", firstErr)
	}
	
	// Verify final state
	finalBudget, err := NewDailyBudget(path, maxBudget)
	if err != nil {
		t.Fatal(err)
	}
	
	if finalBudget.Used() != numProcesses*incrementsPerProcess {
		t.Errorf("cross-process total: used = %d, want %d", 
			finalBudget.Used(), numProcesses*incrementsPerProcess)
	}
	
	// Try one more increment - should fail (budget exhausted)
	if err := finalBudget.Increment(1); err == nil {
		t.Error("expected budget exhausted error after reaching limit")
	}
}

// TestDailyBudgetFailClosedOnCorruptState verifies fail-closed behavior when
// state file is corrupt or unreadable.
func TestDailyBudgetFailClosedOnCorruptState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	// Write corrupt JSON to state file
	if err := os.WriteFile(path, []byte("{ corrupt json }"), 0644); err != nil {
		t.Fatal(err)
	}
	
	// NewDailyBudget should fail closed on corrupt state
	_, err := NewDailyBudget(path, 100)
	if err == nil {
		t.Fatal("expected error when loading corrupt budget state")
	}
	if !strings.Contains(err.Error(), "fail-closed") {
		t.Errorf("error should mention fail-closed, got: %v", err)
	}
}

// TestDailyBudgetFailClosedDuringIncrement verifies fail-closed behavior when
// state becomes corrupt between initialization and increment.
func TestDailyBudgetFailClosedDuringIncrement(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	// Create valid budget
	budget, err := NewDailyBudget(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	
	// First increment should succeed
	if err := budget.Increment(5); err != nil {
		t.Fatal(err)
	}
	
	// Corrupt the state file
	if err := os.WriteFile(path, []byte("corrupted"), 0644); err != nil {
		t.Fatal(err)
	}
	
	// Next increment should fail closed
	err = budget.Increment(5)
	if err == nil {
		t.Fatal("expected fail-closed error after state corruption")
	}
	if !strings.Contains(err.Error(), "fail-closed") {
		t.Errorf("error should mention fail-closed, got: %v", err)
	}
}

// TestDailyBudgetMidnightReset verifies budget resets at midnight UTC across processes.
func TestDailyBudgetMidnightReset(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "budget.json")
	
	budget, err := NewDailyBudget(path, 50)
	if err != nil {
		t.Fatal(err)
	}
	
	// Use some budget
	if err := budget.Increment(30); err != nil {
		t.Fatal(err)
	}
	
	if budget.Used() != 30 {
		t.Fatalf("used = %d, want 30", budget.Used())
	}
	
	// Manually advance date to simulate midnight rollover
	// (save stale state with yesterday's date)
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	state := budgetState{Date: yesterday, Used: 30}
	data, _ := json.MarshalIndent(state, "", "  ")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	
	// Create new budget instance (simulates new process on new day)
	newDayBudget, err := NewDailyBudget(path, 50)
	if err != nil {
		t.Fatal(err)
	}
	
	// Should reset to 0 for new day
	if newDayBudget.Used() != 0 {
		t.Errorf("budget should reset at midnight: used = %d, want 0", newDayBudget.Used())
	}
	
	// Should be able to use full budget again
	if err := newDayBudget.Increment(50); err != nil {
		t.Errorf("should allow full budget on new day: %v", err)
	}
}
