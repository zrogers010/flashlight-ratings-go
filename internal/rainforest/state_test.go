package rainforest

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"strings"
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

// minimal CSV with the same column count as data/manual_catalog.csv (36)
// for testing PruneUnavailable end-to-end without the API.
func writeFixtureCSV(t *testing.T, dir string, asins []string) string {
	t.Helper()
	path := filepath.Join(dir, "fixture.csv")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	defer f.Close()
	w := csv.NewWriter(f)
	header := strings.Split("brand_name,brand_slug,brand_country_code,brand_website_url,model_name,model_slug,model_code,description,release_year,msrp_usd,asin,amazon_url,current_price_usd,amazon_rating_count,amazon_average_rating,image_url,max_lumens,sustained_lumens,max_candela,beam_distance_m,runtime_max_min,runtime_500_min,turbo_stepdown_sec,beam_pattern,battery_type,recharge_type,battery_replaceable,weight_g,length_mm,head_diameter_mm,body_diameter_mm,switch_type,waterproof_rating,impact_resistance_m,body_material,use_case_tags", ",")
	if err := w.Write(header); err != nil {
		t.Fatalf("write header: %v", err)
	}
	for i, asin := range asins {
		row := make([]string, len(header))
		row[0] = "TestBrand"
		row[5] = "Model" + asin
		row[10] = asin
		row[11] = "https://www.amazon.com/dp/" + asin
		row[12] = "10.00"
		_ = i
		if err := w.Write(row); err != nil {
			t.Fatalf("write row: %v", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		t.Fatalf("flush: %v", err)
	}
	return path
}

func TestPruneUnavailable_DropsRowsAboveThreshold(t *testing.T) {
	dir := t.TempDir()
	csvPath := writeFixtureCSV(t, dir, []string{"KEEP", "DROP1", "DROP2", "OKAY"})

	state := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{
		"DROP1": {UnavailableRuns: 3},
		"DROP2": {UnavailableRuns: 5},
		"KEEP":  {UnavailableRuns: 1},
		"OKAY":  {UnavailableRuns: 0},
	}}
	if err := state.Save(StatePathFor(csvPath)); err != nil {
		t.Fatalf("save state: %v", err)
	}

	res, err := PruneUnavailable(csvPath, 3, false)
	if err != nil {
		t.Fatalf("PruneUnavailable: %v", err)
	}
	if len(res.Pruned) != 2 {
		t.Fatalf("pruned %d, want 2", len(res.Pruned))
	}
	pruned := map[string]bool{}
	for _, p := range res.Pruned {
		pruned[p.ASIN] = true
	}
	if !pruned["DROP1"] || !pruned["DROP2"] {
		t.Errorf("expected DROP1+DROP2 pruned, got %v", pruned)
	}

	// Verify CSV no longer contains pruned ASINs
	f, err := os.Open(csvPath)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer f.Close()
	r := csv.NewReader(f)
	rows, err := r.ReadAll()
	if err != nil {
		t.Fatalf("read after prune: %v", err)
	}
	if len(rows) != 1+2 { // header + 2 surviving rows
		t.Fatalf("rows after prune = %d, want %d", len(rows), 3)
	}
	for _, row := range rows[1:] {
		if pruned[row[10]] {
			t.Errorf("pruned ASIN %s still present in CSV", row[10])
		}
	}

	// State should also have the dropped ASINs removed
	postState, err := LoadState(StatePathFor(csvPath))
	if err != nil {
		t.Fatalf("reload state: %v", err)
	}
	for asin := range pruned {
		if _, ok := postState.Entries[asin]; ok {
			t.Errorf("state still tracks pruned ASIN %s", asin)
		}
	}
}

func TestPruneUnavailable_DryRunDoesNotMutate(t *testing.T) {
	dir := t.TempDir()
	csvPath := writeFixtureCSV(t, dir, []string{"DROP"})

	state := &SyncState{Version: 1, Entries: map[string]*SyncStateEntry{
		"DROP": {UnavailableRuns: 4},
	}}
	if err := state.Save(StatePathFor(csvPath)); err != nil {
		t.Fatalf("save state: %v", err)
	}

	res, err := PruneUnavailable(csvPath, 3, true)
	if err != nil {
		t.Fatalf("PruneUnavailable dry-run: %v", err)
	}
	if len(res.Pruned) != 1 {
		t.Fatalf("dry-run pruned %d, want 1", len(res.Pruned))
	}

	// CSV must still have the row
	f, _ := os.Open(csvPath)
	defer f.Close()
	rows, _ := csv.NewReader(f).ReadAll()
	if len(rows) != 2 {
		t.Errorf("dry-run mutated CSV: %d rows, want 2", len(rows))
	}
	// State must still track it
	postState, _ := LoadState(StatePathFor(csvPath))
	if postState.Entries["DROP"] == nil {
		t.Error("dry-run mutated state file")
	}
}

func TestPruneUnavailable_ThresholdZeroIsNoop(t *testing.T) {
	dir := t.TempDir()
	csvPath := writeFixtureCSV(t, dir, []string{"X"})
	res, err := PruneUnavailable(csvPath, 0, false)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(res.Pruned) != 0 {
		t.Errorf("threshold 0 should be noop, got %v pruned", len(res.Pruned))
	}
}
