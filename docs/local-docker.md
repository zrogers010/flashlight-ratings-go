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
- Worker (in dry-run mode by default)

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

- `docker-compose.yml` sets `AMAZON_SYNC_DRY_RUN=true` for the worker by default.
- To use live Amazon sync, edit `docker-compose.yml` and set `AMAZON_SYNC_DRY_RUN: "false"` after filling real creds in `worker.env`.
