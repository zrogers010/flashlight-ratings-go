# Deployment Guide: PR #81 Rollout Blocker Fixes

## Overview

This guide covers deployment of the fixes for three blockers identified during PR #80 rollout:

1. Web prerender `REQUIRE_COMPARE_PAIRS=1` failure
2. Cross-process budget overrun protection
3. DST-aware cron scheduling

## Pre-Deployment Checklist

- [ ] PR #81 merged to `main`
- [ ] Production backup completed
- [ ] Current crontab backed up: `crontab -l > ~/crontab.backup.$(date +%Y%m%d)`
- [ ] Deployment window scheduled (low-traffic period recommended)
- [ ] Rollback plan reviewed

## Deployment Steps

### Step 1: Update Code on Production Server

```bash
# SSH to production server
ssh deploy@your-production-server

# Navigate to app directory
cd /home/deploy/flashlight-ratings-go

# Backup current state
git log --oneline -1 > ~/pre-pr81-commit.txt

# Pull latest code
git fetch origin
git checkout main
git pull origin main

# Verify correct commit
git log --oneline -5
# Should show PR #81 commit at top
```

### Step 2: Rebuild Go Sync Binary (if applicable)

**Option A: Using compiled binary**
```bash
cd /home/deploy/flashlight-ratings-go
go build -o bin/rainforest-sync ./cmd/rainforest-sync

# Verify build
./bin/rainforest-sync -h
```

**Option B: Using Docker Compose**
```bash
cd /home/deploy/flashlight-ratings-go
docker-compose build sync
docker-compose restart sync

# Verify container status
docker-compose ps sync
docker-compose logs sync --tail=50
```

### Step 3: Rebuild Web Static Site

**Option A: Static export deployment**
```bash
cd /home/deploy/flashlight-ratings-go/web

# Install dependencies (if needed)
npm install

# Build with strict compare pairs check
REQUIRE_COMPARE_PAIRS=1 npm run build

# Verify build succeeded and compare pages generated
ls -la .next/ | grep compare
# Should show compare page artifacts

# Deploy to static hosting
# (copy .next/export or dist/ to your static host)
```

**Option B: Docker web service**
```bash
cd /home/repos/flashlight-ratings-go
docker-compose build web
docker-compose restart web

# Verify web service
docker-compose logs web --tail=50
curl http://localhost:3000/compare | head -20
```

### Step 4: Update Production Cron (RECOMMENDED)

This fixes the DST drift (6 AM PST / 7 AM PDT → 7 AM PT year-round).

```bash
# Backup current crontab (already done in pre-deployment checklist)
crontab -l > ~/crontab.backup.$(date +%Y%m%d-%H%M%S)

# Create new crontab with CRON_TZ
CRON_TMP=$(mktemp)
crontab -l 2>/dev/null | grep -vE 'flashlightratings-catalog-sync' > "$CRON_TMP"

# Add DST-aware cron
cat >> "$CRON_TMP" << 'EOF'
CRON_TZ=America/Los_Angeles
0 7 * * * cd /home/deploy/flashlight-ratings-go && SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 bash scripts/catalog-sync.sh >> ~/catalog-sync.log 2>&1 # flashlightratings-catalog-sync
EOF

# Install new crontab
crontab "$CRON_TMP"
rm "$CRON_TMP"

# Verify installed correctly
crontab -l
```

Expected output:
```
CRON_TZ=America/Los_Angeles
0 7 * * * cd /home/deploy/flashlight-ratings-go && ...
```

### Step 5: Verify Budget Files are Gitignored

```bash
cd /home/deploy/flashlight-ratings-go

# Check git status
git status

# Should NOT show:
# - data/*rainforest_budget.json
# - data/*rainforest_budget.json.lock
# - data/*rainforest_budget.json.tmp

# If these appear, DO NOT commit them
# Verify .gitignore is correct
grep rainforest_budget .gitignore
```

Expected gitignore entries:
```
data/*rainforest_budget.json
data/*rainforest_budget.json.lock
data/*rainforest_budget.json.tmp
```

### Step 6: Test Sync Run (Optional but Recommended)

Run a manual sync to verify everything works:

```bash
cd /home/deploy/flashlight-ratings-go

# Run sync manually (will use budget)
SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 bash scripts/catalog-sync.sh

# Monitor output
tail -f ~/catalog-sync.log

# Look for:
# ✓ No "budget exhausted" errors
# ✓ Creators API primary usage
# ✓ Rainforest fallback only if eligibility lapses
# ✓ Budget state file created: data/.manual_catalog.csv.rainforest_budget.json
# ✓ Compare pairs generated (if web build)
```

## Verification

### Verify Cross-Process Budget Protection

Simulate concurrent processes:

```bash
# In terminal 1
cd /home/deploy/flashlight-ratings-go
RAINFOREST_MAX_PER_DAY=10 bash scripts/catalog-sync.sh &

# In terminal 2 (start immediately)
cd /home/deploy/flashlight-ratings-go
RAINFOREST_MAX_PER_DAY=10 bash scripts/catalog-sync.sh &

# Wait for both to complete
wait

# Check logs - both should coordinate via file lock
# Total requests should not exceed 10
grep "used" data/.manual_catalog.csv.rainforest_budget.json
```

Expected: `"used": <number <= 10>`

### Verify Compare Pairs Generation

```bash
# Check web build output
cd /home/deploy/flashlight-ratings-go/web

# If using Next.js
curl http://localhost:3000/compare | grep -o '<title>.*</title>'
# Should show compare page title, not error

# Check static routes were generated
ls .next/server/app/compare/ 2>/dev/null || ls out/compare/ 2>/dev/null
# Should show compare page artifacts
```

### Verify Cron Schedule

```bash
# Check next run time
# Note: This requires cronie >= 1.5 for accurate CRON_TZ calculation

# View cron daemon logs
sudo journalctl -u crond | tail -20

# Or check systemd timer if using systemd
systemctl list-timers | grep catalog
```

## Rollback Procedure

If issues occur, roll back to previous state:

### Step 1: Restore Previous Code

```bash
cd /home/deploy/flashlight-ratings-go

# Get previous commit SHA
cat ~/pre-pr81-commit.txt
# Or use: git log --oneline -5

# Rollback to previous commit (d01d187)
git checkout d01d187

# Rebuild
go build -o bin/rainforest-sync ./cmd/rainforest-sync
# Or: docker-compose build sync && docker-compose restart sync
```

### Step 2: Restore Previous Crontab

```bash
# List backups
ls -lt ~/crontab.backup.*

# Restore most recent backup
crontab ~/crontab.backup.YYYYMMDD

# Verify
crontab -l
```

### Step 3: Clean Budget State (if needed)

If budget state is causing issues:

```bash
cd /home/deploy/flashlight-ratings-go

# Backup current state
cp data/.manual_catalog.csv.rainforest_budget.json ~/budget_backup_$(date +%Y%m%d-%H%M%S).json 2>/dev/null

# Remove budget state (will reset on next run)
rm -f data/.manual_catalog.csv.rainforest_budget.json*
```

### Step 4: Restart Services

```bash
# If using Docker
docker-compose restart sync web

# If using systemd
sudo systemctl restart flashlight-ratings-go

# Verify
docker-compose ps
# Or: systemctl status flashlight-ratings-go
```

## Monitoring Post-Deployment

Monitor these for the first 24-48 hours:

### 1. Sync Logs
```bash
tail -f ~/catalog-sync.log

# Watch for:
# - Successful Creators API calls (primary)
# - Rainforest fallback only on eligibility loss
# - No budget exhausted errors
# - No "no compare pairs" errors
```

### 2. Budget Usage
```bash
# Check current budget state
cat data/.manual_catalog.csv.rainforest_budget.json

# Monitor for cross-process coordination
watch -n 60 'cat data/.manual_catalog.csv.rainforest_budget.json'
```

### 3. Web Service
```bash
# Check compare pages are accessible
curl -I http://localhost:3000/compare
# Should return 200 OK

curl -I http://localhost:3000/compare/some-vs-other
# Should return 200 or 404 (not 500)
```

### 4. Cron Execution
```bash
# Check cron ran at correct time (7 AM PT)
grep "catalog-sync" ~/catalog-sync.log | tail -5

# Verify timezone-aware scheduling
# During PST: should run at 15:00 UTC
# During PDT: should run at 14:00 UTC
# Local time should always be 07:00 America/Los_Angeles
```

## Troubleshooting

### Issue: Budget exhausted errors appearing

**Symptoms:**
```
ERROR: daily budget exhausted: 200/200 used, cannot add 1
```

**Diagnosis:**
- Check if multiple processes are running concurrently
- Verify budget state file is not corrupt

**Resolution:**
```bash
# Check for running sync processes
ps aux | grep catalog-sync

# Check budget state
cat data/.manual_catalog.csv.rainforest_budget.json

# If corrupt, remove and let it recreate
rm data/.manual_catalog.csv.rainforest_budget.json*

# If legitimate exhaustion, wait for midnight UTC reset
# Or manually reset for testing (DO NOT DO IN PRODUCTION):
# echo '{"date":"2000-01-01","used":0}' > data/.manual_catalog.csv.rainforest_budget.json
```

### Issue: Compare pages returning 404

**Symptoms:**
Static compare routes not generated during build

**Diagnosis:**
```bash
cd web
REQUIRE_COMPARE_PAIRS=1 npm run build
# Check if error: "no compare pairs generated from curatedComparePairs"
```

**Resolution:**
- Verify API is accessible at build time
- Check that catalog has items with `overall_score > 0`
- Run verification test: `node test-overall-score-fix.js`

### Issue: Cron not running at correct local time

**Symptoms:**
Cron runs at 6 AM PST instead of 7 AM PT

**Diagnosis:**
```bash
crontab -l | grep CRON_TZ
# Should show: CRON_TZ=America/Los_Angeles

# Check cronie version
rpm -q cronie
# Should be >= 1.5
```

**Resolution:**
- Verify `CRON_TZ` line appears BEFORE the cron schedule
- Verify cronie version supports `CRON_TZ`
- If not supported, use manual DST adjustment (see docs/cron-dst-scheduling.md)

### Issue: File lock contention

**Symptoms:**
```
increment failed after 3 retries: acquire exclusive lock: resource temporarily unavailable
```

**Diagnosis:**
Multiple sync processes competing for budget lock

**Resolution:**
- This is expected behavior when processes overlap
- Failed process will exit; cron will retry on next schedule
- If persistent, check for hung processes:
  ```bash
  ps aux | grep catalog-sync
  lsof | grep rainforest_budget.json.lock
  ```

## Support

For issues or questions:
1. Check relevant documentation:
   - `docs/cron-dst-scheduling.md` - DST-aware cron
   - `docs/listing-freshness-and-amazon-compliance.md` - Sync overview
   - `ROLLOUT_CHECKLIST.md` - PR #80 rollout guide

2. Review test suite:
   ```bash
   go test -v ./internal/rainforest/... -run TestDailyBudget
   ```

3. Check GitHub PR #81 for context and discussion

## Success Criteria

Deployment is successful when:

- [ ] All tests pass: `go test ./internal/rainforest/...`
- [ ] Web builds successfully with `REQUIRE_COMPARE_PAIRS=1`
- [ ] Compare pages are accessible
- [ ] Cron runs at 7:00 AM America/Los_Angeles consistently
- [ ] Budget state file created and updated correctly
- [ ] No budget overrun with concurrent processes
- [ ] Creators API is primary source (Rainforest fallback only)
- [ ] Monitoring shows no errors for 24+ hours

## Timeline

| Step | Duration | Notes |
|------|----------|-------|
| Code update | 5 min | Git pull + rebuild |
| Service restart | 2 min | Docker or binary restart |
| Cron update | 5 min | Backup, update, verify |
| Manual test sync | 10-30 min | Depends on catalog size |
| Monitoring period | 24-48 hrs | Watch for issues |

**Total deployment time:** ~30-60 minutes
**Monitoring period:** 24-48 hours

## References

- PR #81: https://github.com/zrogers010/flashlight-ratings-go/pull/81
- PR #80: Previous rollout (commit d01d187)
- cronie documentation: https://github.com/cronie-crond/cronie
- POSIX flock: `man 2 flock`
