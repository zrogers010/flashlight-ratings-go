# Web App (Next.js)

## Run
1. Install deps:
```bash
npm install
```
2. Start dev server:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```

## Core pages
- `/`
- `/rankings?use_case=tactical`
- `/flashlights`
- `/flashlights/1`
- `/compare?ids=1,2,3`

## Full stack local (Docker)
From repo root:
```bash
./scripts/dev-up.sh
```

Guide:
- `docs/local-docker.md`
