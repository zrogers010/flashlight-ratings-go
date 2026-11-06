package rainforest

import (
	"os"
	"path/filepath"
	"testing"
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
