# Deployment Guide for Regression Fixes (PR #83)

This guide provides step-by-step instructions for deploying the fixes for the two regressions introduced in PR #82.

## Current State

- **Production**: Rolled back to commit `9c5e848` (pre-PR82, all products visible in listings)
- **Main branch**: At commit `f70e051` (PR82 merged, has regressions)
- **This PR**: Fixes regressions while preserving out-of-stock filtering

## Pre-Deployment Checklist

- [ ] All tests pass in CI
- [ ] Local integration tests pass (see REGRESSION_FIX_VERIFICATION.md)
- [ ] Web static build succeeds with 176 routes
- [ ] PR approved and merged to main

## Deployment Steps

### 1. Merge PR and Pull Latest

```bash
# After PR approval, merge via GitHub UI
# Then pull the latest main branch
cd /path/to/flashlight-ratings-go
git checkout main
git pull origin main

# Verify you're on the correct commit (should include fix commit)
git log --oneline -5
```

### 2. Build New Images

```bash
# Build API and web services with new code
docker compose build api web

# Verify builds succeeded
docker images | grep flashlight
```

### 3. Stop Current Services

```bash
# Stop running services (preserves database data)
docker compose stop api web

# Optional: Check that database is still running
docker compose ps
```

### 4. Deploy New Images

```bash
# Start updated services
docker compose up -d api web

# Monitor startup logs
docker compose logs -f api web
```

### 5. Verify Deployment

#### Check API Health
```bash
# Test new all-slugs endpoint
curl http://localhost:8080/flashlights/all-slugs | jq 'length'
# Expected: 176

# Test finder endpoint
curl "http://localhost:8080/finder?max_price=150&min_throw=100" | jq 'length'
# Expected: Array of results (no 500 error)

# Test filtered listing
curl http://localhost:8080/flashlights | jq '.total'
# Expected: 88 (or current in-stock count)
```

#### Check Web Routes
```bash
# Wait for web service to be ready
sleep 10

# Test out-of-stock review URLs (replace localhost:3000 with your domain)
curl -I http://localhost:3000/reviews/acebeam-l19-2
# Expected: HTTP/1.1 200 OK

curl -I http://localhost:3000/reviews/olight-warrior-x-4
# Expected: HTTP/1.1 200 OK

# Verify they show unavailable status
curl http://localhost:3000/reviews/acebeam-l19-2 | grep -i "currently unavailable"
# Expected: Should find text
```

#### Check Sitemap
```bash
# Verify sitemap includes all 176 review routes
curl http://localhost:3000/sitemap.xml | grep -c '<loc>.*reviews/.*</loc>'
# Expected: 176
```

### 6. Monitor for Issues

```bash
# Watch logs for errors
docker compose logs -f --tail=100 api web

# Check for SQL errors
docker compose logs api | grep -i "error"

# Check for 404s
docker compose logs web | grep -i "404"
```

### 7. Update Production (if applicable)

If deploying to a separate production environment:

```bash
# SSH to production server
ssh production-server

# Pull latest code
cd /path/to/flashlight-ratings-go
git pull origin main

# Build and deploy
docker compose build api web
docker compose stop api web
docker compose up -d api web

# Run verification tests
./verify-deployment.sh  # See REGRESSION_FIX_VERIFICATION.md
```

## Rollback Plan

If issues are discovered after deployment:

### Option 1: Revert to Previous Commit

```bash
# Identify the commit to revert
git log --oneline -10

# Revert the fix commit (creates new commit)
git revert <fix-commit-sha>
git push origin main

# Rebuild and redeploy
docker compose build api web
docker compose up -d api web
```

### Option 2: Fast Rollback to 9c5e848

```bash
# Deploy pre-PR82 commit (shows all products in listings)
git checkout 9c5e848
docker compose build api web
docker compose up -d api web

# Note: This is a temporary rollback
# Create a proper revert commit later
```

### Option 3: Cherry-pick Specific Fix

If only one regression needs to be rolled back:

```bash
# Revert just the sitemap changes, keep finder fix
git revert <commit-sha> --no-commit
# Manually unstage files you want to keep
git restore --staged internal/api/repository.go internal/api/server.go internal/api/integration_test.go
git commit -m "Revert sitemap changes, keep finder fix"
```

## Post-Deployment Verification

After deployment, verify:

1. **All 176 review routes work**
   ```bash
   # Sample 10 random products including known OOS ones
   for slug in acebeam-l19-2 olight-warrior-x-4 nitecore-mh12s fenix-pd36r; do
     STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://flashlightratings.com/reviews/$slug")
     echo "$slug: $STATUS"
   done
   # Expected: All should return 200
   ```

2. **Shopping listings show only in-stock products**
   ```bash
   curl https://flashlightratings.com/api/flashlights | jq '.total'
   # Expected: 88 (approximately, depends on current stock levels)
   
   curl https://flashlightratings.com/api/flashlights | jq '.items[].availability_status' | sort | uniq
   # Expected: Only "in_stock"
   ```

3. **Finder works without errors**
   ```bash
   curl https://flashlightratings.com/api/finder?max_price=150 | jq 'length'
   # Expected: Number > 0 (no 500 error)
   ```

4. **Sitemap is complete**
   ```bash
   curl https://flashlightratings.com/sitemap.xml | grep -c reviews
   # Expected: 176
   ```

5. **Google Search Console** (check 24-48 hours after deployment)
   - No increase in 404 errors
   - 176 review URLs indexed (or increasing toward 176)
   - No "soft 404" warnings for out-of-stock review pages

## Monitoring

### Key Metrics to Watch

1. **Error rates**
   - 500 errors on `/finder` should drop to zero
   - 404 errors on `/reviews/*` should drop significantly

2. **Route coverage**
   - 176 review routes accessible (up from 88)
   - Sitemap includes 176 review URLs

3. **User experience**
   - Out-of-stock products show "Currently unavailable" (not 404)
   - Shopping/discovery listings show only in-stock products
   - No broken compare URLs

### Logs to Monitor

```bash
# API errors
docker compose logs api | grep -i "error\|fatal\|panic"

# SQL errors
docker compose logs api | grep -i "sql\|postgres\|database"

# Web 404s
docker compose logs web | grep "404"

# Finder requests
docker compose logs api | grep "/finder"
```

## Troubleshooting

### Issue: Finder still returns 500

**Cause**: Old API container still running

**Fix**:
```bash
docker compose stop api
docker compose rm -f api
docker compose up -d api
```

### Issue: Review URLs still 404

**Cause**: Web container not rebuilt or old static files cached

**Fix**:
```bash
docker compose stop web
docker compose rm -f web
docker compose build --no-cache web
docker compose up -d web
```

### Issue: All 176 products showing in shopping listings

**Cause**: Filtered listing query not working

**Fix**: Check database for recent price snapshot data:
```bash
docker compose exec db psql -U flashlight_app -d flashlight -c "SELECT COUNT(*), in_stock FROM flashlight_price_snapshots WHERE currency_code = 'USD' GROUP BY in_stock;"
```

If no recent snapshots, run catalog sync:
```bash
docker compose run --rm rainforest-sync
```

### Issue: Sitemap still shows only 88 URLs

**Cause**: Sitemap cache not cleared

**Fix**:
```bash
# Force sitemap rebuild
curl -X PURGE http://localhost:3000/sitemap.xml
# Or restart web service
docker compose restart web
```

## Success Criteria

Deployment is successful when:

- ✓ All 176 review URLs return 200 (not 404)
- ✓ Out-of-stock products show truthful unavailable status
- ✓ Shopping/discovery listings show only ~88 in-stock products
- ✓ `/finder` returns 200 with filtered results
- ✓ Sitemap includes all 176 review URLs
- ✓ No new errors in logs
- ✓ Integration tests pass

## Timeline

- **Merge**: Immediate after PR approval
- **Build**: ~5 minutes
- **Deployment**: ~2 minutes
- **Verification**: ~10 minutes
- **Total downtime**: <30 seconds (rolling restart)

## Contacts

If issues arise during deployment, contact:
- Repository owner: @zrogers010
- Review deployment logs before escalating
