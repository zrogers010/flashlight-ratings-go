# DST-Aware Cron Scheduling for Catalog Sync

## Problem Statement

The production catalog sync is intended to run at **7:00 AM America/Los_Angeles** daily.

A fixed UTC cron schedule like `0 14 * * *` (14:00 UTC) runs at:
- **7:00 AM PDT** during daylight saving time (March-November)
- **6:00 AM PST** during standard time (November-March)

This means the sync drifts by one hour twice per year when DST transitions occur.

## Solution: CRON_TZ in cronie

Amazon Linux 2 and AL2023 use **cronie** (version 1.5+), which supports the `CRON_TZ` environment variable for timezone-aware scheduling.

### Recommended Production Crontab

```cron
CRON_TZ=America/Los_Angeles
0 7 * * * cd /home/deploy/flashlight-ratings-go && SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 bash scripts/catalog-sync.sh >> ~/catalog-sync.log 2>&1 # flashlightratings-catalog-sync
```

This configuration:
- **Always runs at 7:00 AM Pacific Time** (both PST and PDT)
- Automatically adjusts for DST transitions
- Maintains consistent local scheduling year-round

### Verification

After installing the crontab, verify with:

```bash
crontab -l
```

The `CRON_TZ` line must appear **before** the cron schedule line in the crontab file.

### Testing DST Transitions

To verify the cron will run at the correct local time during both standard and daylight saving:

```bash
# Check next scheduled run time
# The output should show 07:00 in America/Los_Angeles timezone
systemctl status crond
journalctl -u crond | tail -20
```

### Alternative: Manual DST Adjustment

If `CRON_TZ` is not supported (older cronie versions < 1.5), you must manually update the UTC time twice per year:

- **During PST (November-March):** Use `0 15 * * *` (15:00 UTC = 7:00 AM PST)
- **During PDT (March-November):** Use `0 14 * * *` (14:00 UTC = 7:00 AM PDT)

This approach is **not recommended** as it requires manual intervention and is error-prone.

## Current Production State (as of rollout)

**Current configuration (unverified):**
```cron
0 14 * * * ... # 14:00 UTC = 6 AM PST / 7 AM PDT
```

This fixed UTC schedule runs at:
- Winter (PST): 6:00 AM local ⚠️ *one hour early*
- Summer (PDT): 7:00 AM local ✓

**Recommended fix:** Update production crontab to use `CRON_TZ=America/Los_Angeles` with `0 7 * * *` schedule.

## Deploy Script Integration

The `scripts/deploy.sh install-cron` helper does not currently set `CRON_TZ`. To install with timezone-aware scheduling:

```bash
# Manual installation with CRON_TZ
CRON_TZ_LINE='CRON_TZ=America/Los_Angeles'
CRON_SCHEDULE='0 7 * * *'
crontab -l 2>/dev/null | grep -v 'flashlightratings-catalog-sync' > /tmp/crontab.new
echo "$CRON_TZ_LINE" >> /tmp/crontab.new
echo "$CRON_SCHEDULE cd /home/deploy/flashlight-ratings-go && SYNC_SOURCE=auto SYNC_RATINGS_SOURCE=off RAINFOREST_MAX_PER_DAY=200 PRUNE_THRESHOLD=2 bash scripts/catalog-sync.sh >> ~/catalog-sync.log 2>&1 # flashlightratings-catalog-sync" >> /tmp/crontab.new
crontab /tmp/crontab.new
rm /tmp/crontab.new
```

## References

- cronie documentation: https://github.com/cronie-crond/cronie
- Amazon Linux 2 cron: Uses cronie 1.5+ (supports CRON_TZ)
- Amazon Linux 2023 cron: Uses cronie 1.6+ (supports CRON_TZ)
- Timezone database: America/Los_Angeles tracks both PST (-08:00) and PDT (-07:00)
