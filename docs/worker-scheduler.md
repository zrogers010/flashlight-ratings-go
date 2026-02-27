# Worker Scheduler

Runs a recurring pipeline:
1. Amazon sync (`amazon-sync` logic)
2. Score recalculation (`scorejob` logic)

## Run
```bash
DATABASE_URL=postgres://... \
AMAZON_REGION=US \
AMAZON_PARTNER_TAG=yourtag-20 \
AMAZON_ACCESS_KEY_ID=... \
AMAZON_SECRET_ACCESS_KEY=... \
go run ./cmd/worker
```

## Key env vars
- `WORKER_INTERVAL_SEC` (default `1800`)
- `WORKER_RUN_ON_START` (default `true`)
- `AMAZON_SYNC_TIMEOUT_SEC` (default `120`)
- `SCOREJOB_TIMEOUT_SEC` (default `120`)
- `SCORING_FORMULA_VERSION` (default `v1`)
- `SCORING_INITIATED_BY` (default `worker`)

Amazon sync tuning env vars also apply:
- `AMAZON_SYNC_BATCH_SIZE`
- `AMAZON_SYNC_MAX_RETRIES`
- `AMAZON_SYNC_RETRY_BACKOFF_MS`

For production setup on EC2/systemd (including secure env files), see:
- `docs/production-deployment.md`
