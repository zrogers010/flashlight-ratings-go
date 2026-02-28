# Local Run With Docker

## One command

From repo root:

```bash
./scripts/dev-up.sh
```

This starts:
- PostgreSQL (`localhost:5432`)
- API (`localhost:8080`)
- Web (`localhost:3000`)
- Worker (live PA-API mode by default unless overridden)

DB initializes automatically with:
- migrations
- scoring seed
- demo flashlight + affiliate link records

Open:
- `http://localhost:3000/rankings?use_case=tactical`

## Stop

```bash
./scripts/dev-down.sh
```

## Notes

- `worker.env` controls worker behavior. Set `AMAZON_SYNC_DRY_RUN=false` for live sync.
- Required for live sync:
  - `AMAZON_ACCESS_KEY_ID`
  - `AMAZON_SECRET_ACCESS_KEY`
  - `AMAZON_PARTNER_TAG`
- After updating `worker.env`, restart worker:

```bash
docker compose up -d --build worker
```

- Trigger an immediate sync cycle now:

```bash
docker compose logs -f --tail=100 worker
```
