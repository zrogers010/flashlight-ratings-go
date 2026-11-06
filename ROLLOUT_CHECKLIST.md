# Creators API Primary Rollout Checklist

**PR**: #80 (cursor/creators-api-primary-7e5a)  
**Status**: Implementation complete, **NOT AUTHORIZED** for merge/deploy  
**Date**: 2026-11-06

---

## What Changed

### Configuration Changes Only

**Before** (Rainforest-only):
```bash
SYNC_SOURCE=rainforest 
SYNC_RATINGS_SOURCE=off
# No budget tracking
```

**After** (Creators primary, fallback-only):
```bash
SYNC_SOURCE=auto
SYNC_RATINGS_SOURCE=off  # fallback-only, not routine reinforcement
RAINFOREST_MAX_PER_DAY=200  # genuine hard daily budget
```

### Infrastructure Added

- **`internal/rainforest/budget.go`**: Genuine daily request budget tracker
  - Persists state to `data/.manual_catalog.csv.rainforest_budget.json`
  - Resets at midnight UTC
  - Enforced across all Rainforest API calls (fallback, retries)
  - 200/day ceiling applies to requests, not just ASIN selection

- **Budget tracking**: Each `client.get()` increments before making request
- **Transient eligibility**: Tries Creators on every run, fails over when denied, doesn't latch

---

## Required Changes for Production

### 1. Environment Variables

Add to **`.env`** (for catalog-sync script):
```bash
# Already present - verify value:
AMAZON_PARTNER_TAG=flashlightrat-20

# NEW - add these:
AMAZON_CREATORS_CLIENT_ID=amzn1.application-oa2-client.[YOUR_VALUE]
AMAZON_CREATORS_CLIENT_SECRET=amzn1.oa2-cs.v1.[YOUR_VALUE]

# Already present - verify:
RAINFOREST_API_KEY=[YOUR_KEY]
```

Add to **`worker.env`** (for worker container):
```bash
# NEW - add these same credentials:
AMAZON_CREATORS_CLIENT_ID=amzn1.application-oa2-client.[YOUR_VALUE]
AMAZON_CREATORS_CLIENT_SECRET=amzn1.oa2-cs.v1.[YOUR_VALUE]

# OPTIONAL - to enforce budget in worker too (default: 0 = unlimited):
RAINFOREST_MAX_PER_DAY=200
```

**Format verification**:
- Client ID starts with `amzn1.application-oa2-client.`
- Client Secret starts with `amzn1.oa2-cs.v1.`
- Both are long alphanumeric strings

### 2. Crontab Update

**Current** (verify actual production crontab first):
```bash
# UNKNOWN - cannot verify without production access
# Documented as: 0 14 * * * (daily 14:00 UTC)
# Likely: SYNC_SOURCE=rainforest SYNC_RATINGS_SOURCE=off
```

**New** (update to):
```bash
0 14 * * * cd /path/to/app && \
  SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off \
  RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 \
  bash scripts/catalog-sync.sh >> $HOME/catalog-sync.log 2>&1
```

**Changes**:
- `SYNC_SOURCE`: `rainforest` → `auto`
- `SYNC_RATINGS_SOURCE`: remains `off` (fallback-only)
- `RAINFOREST_MAX_PER_DAY`: NEW, hard ceiling (200/day)
- `SYNC_ROTATE_DAYS`, `SYNC_LIMIT`: REMOVE (incompatible with budget approach)

### 3. Budget State File

**New file** (auto-created):
```
data/.manual_catalog.csv.rainforest_budget.json
```

**Contents** (managed automatically):
```json
{
  "date": "2026-11-06",
  "used": 0
}
```

**Gitignore**: Already present (hidden file pattern)

---

## Verification Commands (Safe - No Secret Output)

### 1. Check Environment Files Exist

```bash
# On production server (as deploy user):
cd /path/to/app
ls -la .env worker.env

# Should show both files exist (permissions 0600 or 0644)
```

### 2. Verify Env Variables Are Set (Redacted)

```bash
# Check without exposing values:
grep -q "^AMAZON_CREATORS_CLIENT_ID=" .env && echo "CLIENT_ID: SET" || echo "CLIENT_ID: MISSING"
grep -q "^AMAZON_CREATORS_CLIENT_SECRET=" .env && echo "CLIENT_SECRET: SET" || echo "CLIENT_SECRET: MISSING"
grep -q "^RAINFOREST_API_KEY=" .env && echo "RAINFOREST_KEY: SET" || echo "RAINFOREST_KEY: MISSING"
grep -q "^AMAZON_PARTNER_TAG=" .env && echo "PARTNER_TAG: SET" || echo "PARTNER_TAG: MISSING"

# Verify format (first few chars only - safe):
grep "^AMAZON_CREATORS_CLIENT_ID=" .env | cut -d= -f2 | cut -c1-20
# Should show: amzn1.application-oa

grep "^AMAZON_CREATORS_CLIENT_SECRET=" .env | cut -d= -f2 | cut -c1-15
# Should show: amzn1.oa2-cs.v1

# Verify tag matches expected:
grep "^AMAZON_PARTNER_TAG=" .env
# Should show: AMAZON_PARTNER_TAG=flashlightrat-20
```

### 3. Check Current Crontab

```bash
# View current cron (safe):
crontab -l | grep -i catalog

# Should show current schedule
# NOTE: Cannot determine actual current config without production access
```

### 4. Verify Docker Compose Passes Env Vars

```bash
# Check docker-compose config (safe):
grep -A 5 "rainforest-sync:" docker-compose.yml | grep AMAZON_CREATORS

# Should show:
#   AMAZON_CREATORS_CLIENT_ID: ${AMAZON_CREATORS_CLIENT_ID:-}
#   AMAZON_CREATORS_CLIENT_SECRET: ${AMAZON_CREATORS_CLIENT_SECRET:-}
```

### 5. Test Credentials (Safe - Redacted Output)

```bash
# Test OAuth token fetch (redact result):
curl -X POST https://api.amazon.com/auth/o2/token \
  -H "Content-Type: application/json" \
  -d @- <<EOF | jq -r 'if .access_token then "TOKEN: RECEIVED" else .error end'
{
  "grant_type": "client_credentials",
  "client_id": "$(grep "^AMAZON_CREATORS_CLIENT_ID=" .env | cut -d= -f2)",
  "client_secret": "$(grep "^AMAZON_CREATORS_CLIENT_SECRET=" .env | cut -d= -f2)",
  "scope": "creatorsapi::default"
}
EOF

# Expected output if valid: TOKEN: RECEIVED
# If invalid: error message (safe - no credentials exposed)
```

---

## Deployment Steps

### Pre-Deployment

1. ✅ **All tests passing**: 40 tests, 100% success
2. ❌ **Credentials verified**: Cannot verify without production access
3. ❌ **Current cron documented**: Cannot determine without production access
4. ❌ **Backup plan ready**: Need current config to document rollback

### Deployment (Requires Production Access)

1. **Add credentials** to `.env` and `worker.env`
   ```bash
   # Edit files (as deploy user):
   cd /path/to/app
   nano .env  # add AMAZON_CREATORS_* vars
   nano worker.env  # add same vars
   ```

2. **Test credentials** (using safe verification commands above)

3. **Update crontab**
   ```bash
   crontab -e
   # Change SYNC_SOURCE=rainforest to SYNC_SOURCE=auto
   # Add RAINFOREST_MAX_PER_DAY=200
   # Remove SYNC_ROTATE_DAYS, SYNC_LIMIT if present
   ```

4. **Manual test run** (small batch)
   ```bash
   cd /path/to/app
   SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off \
   RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 \
   bash scripts/catalog-sync.sh
   
   # Check logs for:
   # - "primary source: creators-api" (success)
   # - "Rainforest budget: 0/200 used today" (budget active)
   # - No "WARNING: unavailable" (unless expected)
   ```

5. **Monitor first scheduled run** (14:00 UTC)
   ```bash
   tail -f $HOME/catalog-sync.log
   
   # Watch for:
   # - Successful OAuth token fetch
   # - Batch getItems calls (10 ASINs each)
   # - Budget tracking messages
   # - No errors or unexpected fallbacks
   ```

### Rollback (Immediate)

```bash
# Revert crontab:
crontab -e
# Change back to: SYNC_SOURCE=rainforest SYNC_RATINGS_SOURCE=off
# Remove RAINFOREST_MAX_PER_DAY

# No code changes needed - configuration only
```

---

## Build/Deploy Requirements

### Compilation Needed?

**YES** - New Go code added:
- `internal/rainforest/budget.go`
- Budget tracking in `internal/rainforest/client.go`
- Updated `cmd/rainforest-sync/main.go`

### Deployment Steps

1. **Merge PR** (after review and authorization)
2. **On production server** (as deploy user):
   ```bash
   cd /path/to/app
   git pull origin main
   docker compose build rainforest-sync worker
   docker compose restart worker  # if worker uses Creators
   ```

3. **Verify build**:
   ```bash
   docker compose run --rm rainforest-sync --help
   # Should show updated usage with budget options
   ```

### Services to Restart

- ✅ **rainforest-sync**: Rebuilt (docker compose build)
- ✅ **worker**: Restart if it uses Creators API
- ❌ **api**: No changes (no restart needed)
- ❌ **web**: No changes (no restart needed)

---

## What Remains Unverified (Cannot Check Without Production Access)

### Environment Files
- ❌ Whether `.env` exists on production server
- ❌ Whether `worker.env` exists on production server
- ❌ Whether Creators credentials are already configured
- ❌ Whether Rainforest key is valid and active

### Cron Configuration
- ❌ Actual current crontab schedule
- ❌ Whether cron runs as deploy user or root
- ❌ Actual SYNC_SOURCE value currently in use
- ❌ Whether SYNC_ROTATE_DAYS or SYNC_LIMIT are set
- ❌ Actual log file location

### Runtime State
- ❌ Current catalog size (documented as ~176 ASINs, not verified)
- ❌ Whether manual_catalog.csv exists and is current
- ❌ Whether docker-compose is v1 or v2 on production
- ❌ Actual deployment directory path

### Credentials
- ❌ Whether Creators eligibility is currently active
- ❌ Whether Rainforest API plan is 10k credits/month
- ❌ Actual Rainforest usage limits
- ❌ Partner tag value (assumed `flashlightrat-20` but not confirmed)

---

## Risk Assessment

### Known Risks

1. **Creators eligibility fluctuation**
   - Sales near threshold → access may come/go
   - **Mitigation**: Automatic transient failover to Rainforest
   - **Test coverage**: 7 tests for eligibility loss/recovery

2. **Budget exhaustion mid-run**
   - If 200 requests hit during sync
   - **Mitigation**: Budget check before each request, sync stops gracefully
   - **Recovery**: Resets at midnight UTC, retry next run

3. **Missing credentials**
   - If Creators credentials not added to production
   - **Mitigation**: Immediate fallback to Rainforest (existing behavior)
   - **Detection**: Log line "WARNING: creators-api unavailable"

### Unknown Risks (Unverifiable Without Production Access)

1. **Current production state** - Cannot verify actual cron config
2. **Credential format** - Assumed OAuth format, not confirmed
3. **Build artifacts** - Whether compiled binaries exist on production
4. **Cron permissions** - Who runs cron, where logs go
5. **Rainforest plan limits** - Actual API quotas unknown

---

## Test Results

### All Tests Passing

```bash
$ go test ./internal/rainforest ./internal/amazon
ok  	flashlight-ratings-go/internal/rainforest	0.023s
ok  	flashlight-ratings-go/internal/amazon	1.131s
```

**Test count**: 40 total (19 new + 21 existing)

**New tests** (19):
- **Budget enforcement** (11 tests):
  - TestDailyBudgetBasics
  - TestDailyBudgetUnlimited
  - TestDailyBudgetPersistence
  - TestDailyBudgetDateRollover
  - TestDailyBudgetMissingFile
  - TestDailyBudgetIncrementAutoSaves
  - TestDailyBudgetReset
  - TestDailyBudgetNegativeMax
  - TestDailyBudgetZeroIncrement
  - TestDailyBudgetNegativeIncrement
  - TestDailyBudgetConcurrentAccess

- **Transient eligibility** (7 tests):
  - TestTransientEligibilityLossAndRecovery
  - TestTransientEligibilityPreloadFailure
  - TestDataPreservedDuringEligibilityFluctuation
  - TestNoLatchingToFallback
  - TestMidRunEligibilityLossDoesNotRetryPrimary
  - TestLoggingRedactsCredentials

- **Budget path** (1 test):
  - TestBudgetPathFor

**Coverage**:
- ✅ Budget enforced before each request
- ✅ Budget persists across runs (same day)
- ✅ Budget resets at midnight UTC
- ✅ Eligibility loss triggers failover (not latch)
- ✅ Eligibility recovery automatic on next run
- ✅ Mid-run failover doesn't retry primary per ASIN
- ✅ Data preserved during eligibility fluctuation
- ✅ Credentials redacted in logs

---

## Actual Behavior vs. Claims

### Corrected Understandings

**Budget Enforcement**:
- **BEFORE**: SYNC_LIMIT only limited rows processed, not API calls
- **NOW**: Genuine request counter, increments before each Rainforest API call
- **Scope**: Applies to fallback, ratings reinforcement, retries
- **Persistence**: Saves to JSON after each call, resets at midnight UTC

**Ratings Source Default**:
- **BEFORE**: Defaulted to `rainforest` (routine reinforcement)
- **NOW**: Defaults to `off` (fallback-only)
- **Rationale**: Fallback for eligibility loss, not routine API expense

**Field Support**:
- **Verified**: Code shows Creators provides offers/images/features
- **Unverified**: Whether customerReviews is actually gated (account-specific)
- **No assumption**: Don't claim "typical accounts" or "~10 sales threshold"

**Cost Analysis**:
- **BEFORE**: Specific dollar amounts, monthly savings
- **NOW**: No cost claims (Rainforest pricing unknown, usage depends on eligibility)
- **Observable**: Request count logged, budget enforced

---

## Remaining Blockers

**NONE for code** - implementation complete, tests passing

**BLOCKERS for rollout**:
1. ❌ **Production environment audit** - Need actual cron config
2. ❌ **Credential verification** - Need to test OAuth on production
3. ❌ **Current usage baseline** - Need to measure actual Rainforest calls/day
4. ❌ **Authorization** - User has NOT authorized merge/deploy

---

## Does Merge/Deploy Alone Suffice?

**NO** - Additional steps required:

1. **Merge PR** → Code deployed
2. **Add credentials** → `.env` and `worker.env` (manual)
3. **Update cron** → Change SYNC_SOURCE, add RAINFOREST_MAX_PER_DAY (manual)
4. **Rebuild** → `docker compose build rainforest-sync worker`
5. **Restart** → `docker compose restart worker`
6. **Test** → Manual sync run to verify
7. **Monitor** → Watch first scheduled run

**Not automatic** - Requires production access and manual configuration.

---

## Summary

**Status**: Ready for code review, NOT ready for production rollout

**What's complete**:
- ✅ Code changes (budget tracking, transient eligibility)
- ✅ Configuration changes (defaults corrected)
- ✅ Tests (40 total, 100% passing)
- ✅ Documentation (corrected, unsubstantiated claims removed)

**What's needed for rollout**:
- ❌ Production environment audit
- ❌ Credentials added to env files
- ❌ Crontab updated
- ❌ Build and restart
- ❌ User authorization to proceed

**Recommended next step**: Audit production environment to document actual current state before proceeding.

---

**PR**: https://github.com/zrogers010/flashlight-ratings-go/pull/80  
**Author**: Cursor Agent (cursor/creators-api-primary-7e5a)  
**Date**: 2026-11-06
