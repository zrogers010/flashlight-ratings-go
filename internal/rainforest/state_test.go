package rainforest

import (
	"path/filepath"
	"testing"
)

func TestStatePathFor(t *testing.T) {
	cases := []struct {
		csv  string
		want string
	}{
		{"data/manual_catalog.csv", "data/manual_catalog.sync_state.json"},
		{"foo.csv", "foo.sync_state.json"},
		{"/abs/path/cat.csv", "/abs/path/cat.sync_state.json"},
		{"no_extension", "no_extension.sync_state.json"},
	}
	for _, c := range cases {
		got := StatePathFor(c.csv)
		if got != c.want {
			t.Errorf("StatePathFor(%q) = %q, want %q", c.csv, got, c.want)
		}
	}
}

func TestLoadState_MissingFileReturnsEmpty(t *testing.T) {
	dir := t.TempDir()
	s, err := LoadState(filepath.Join(dir, "does_not_exist.json"))
	if err != nil {
		t.Fatalf("expected no error for missing file, got %v", err)
	}
	if s == nil {
		t.Fatal("expected non-nil state")
	}
	if s.Version != 1 {
		t.Errorf("version = %d, want 1", s.Version)
	}
	if len(s.Entries) != 0 {
		t.Errorf("entries = %v, want empty", s.Entries)
	}
}

func TestMarkUnavailable_IncrementsStreakAndSetsFirstSeen(t *testing.T) {
	s := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}

	s.MarkUnavailable("B0XX", "Acme", "Falcon", "no price")
	e := s.Entries["B0XX"]
	if e.UnavailableRuns != 1 {
		t.Fatalf("first mark: streak = %d, want 1", e.UnavailableRuns)
	}
	if e.FirstUnavailableAt.IsZero() {
		t.Error("first mark: FirstUnavailableAt should be set")
	}
	first := e.FirstUnavailableAt

	s.MarkUnavailable("B0XX", "Acme", "Falcon", "no price")
	if e.UnavailableRuns != 2 {
		t.Fatalf("second mark: streak = %d, want 2", e.UnavailableRuns)
	}
	if !e.FirstUnavailableAt.Equal(first) {
		t.Error("second mark: FirstUnavailableAt should not change")
	}
}

func TestMarkAvailable_ResetsStreak(t *testing.T) {
	s := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}
	s.MarkUnavailable("B0XX", "Acme", "Falcon", "no price")
	s.MarkUnavailable("B0XX", "Acme", "Falcon", "no price")
	s.MarkAvailable("B0XX", "Acme", "Falcon")

	e := s.Entries["B0XX"]
	if e.UnavailableRuns != 0 {
		t.Errorf("streak after MarkAvailable = %d, want 0", e.UnavailableRuns)
	}
	if !e.FirstUnavailableAt.IsZero() {
		t.Errorf("FirstUnavailableAt should be zeroed after MarkAvailable")
	}
}

func TestASINsUnavailableFor(t *testing.T) {
	s := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{
		"A": {UnavailableRuns: 1},
		"B": {UnavailableRuns: 3},
		"C": {UnavailableRuns: 5},
		"D": {UnavailableRuns: 0},
	}}

	got := s.ASINsUnavailableFor(3)
	want := map[string]bool{"B": true, "C": true}
	if len(got) != len(want) {
		t.Fatalf("ASINsUnavailableFor(3) = %v, want %v", got, want)
	}
	for _, a := range got {
		if !want[a] {
			t.Errorf("unexpected ASIN %s in result", a)
		}
	}

	if got := s.ASINsUnavailableFor(0); got != nil {
		t.Errorf("threshold=0 should return nil, got %v", got)
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")

	in := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{}}
	in.MarkUnavailable("B001", "BrandX", "ModelX", "discontinued")
	in.MarkAvailable("B002", "BrandY", "ModelY")

	if err := in.Save(path); err != nil {
		t.Fatalf("Save: %v", err)
	}
	out, err := LoadState(path)
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if got := out.Entries["B001"].UnavailableRuns; got != 1 {
		t.Errorf("round-trip B001 streak = %d, want 1", got)
	}
	if got := out.Entries["B001"].LastReason; got != "discontinued" {
		t.Errorf("round-trip B001 reason = %q, want %q", got, "discontinued")
	}
	if got := out.Entries["B002"].UnavailableRuns; got != 0 {
		t.Errorf("round-trip B002 streak = %d, want 0", got)
	}
}

func TestGarbageCollect_RemovesUntrackedASINs(t *testing.T) {
	s := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{
		"KEEP1": {UnavailableRuns: 1},
		"KEEP2": {UnavailableRuns: 0},
		"GONE1": {UnavailableRuns: 5},
		"GONE2": {UnavailableRuns: 0},
	}}
	removed := s.GarbageCollect(map[string]bool{"KEEP1": true, "KEEP2": true})
	if removed != 2 {
		t.Errorf("removed = %d, want 2", removed)
	}
	if _, ok := s.Entries["GONE1"]; ok {
		t.Error("GONE1 should be deleted")
	}
	if _, ok := s.Entries["KEEP1"]; !ok {
		t.Error("KEEP1 should be preserved")
	}
}

func TestIsAmazonHostedImage(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"", false},
		{"https://m.media-amazon.com/images/I/61abc.jpg", true},
		{"https://images-na.ssl-images-amazon.com/images/P/B0XX.jpg", true},
		{"https://M.MEDIA-AMAZON.COM/images/I/x.jpg", true}, // case-insensitive
		{"https://cdn.olightstore.com/image/baldr.jpg", false},
		{"https://www.fenixlight.com/wp-content/uploads/x.png", false},
		{"https://img.staticdj.com/foo.png", false},
	}
	for _, c := range cases {
		if got := isAmazonHostedImage(c.url); got != c.want {
			t.Errorf("isAmazonHostedImage(%q) = %v, want %v", c.url, got, c.want)
		}
	}
}

func TestEnsureAvailabilityColumnsMigratesLegacyRows(t *testing.T) {
	records := [][]string{
		make([]string, 36),
		make([]string, 36),
	}

	ensureAvailabilityColumns(records)

	if got := records[0][colAmazonPurchasable]; got != "amazon_purchasable" {
		t.Fatalf("purchasable header = %q", got)
	}
	if got := records[0][colAmazonCheckedAt]; got != "amazon_availability_checked_at" {
		t.Fatalf("checked-at header = %q", got)
	}
	if got := records[1][colAmazonPurchasable]; got != "true" {
		t.Fatalf("legacy row default = %q, want true", got)
	}
	if got := records[1][colAmazonCheckedAt]; got != "" {
		t.Fatalf("legacy checked-at = %q, want empty", got)
	}
}
