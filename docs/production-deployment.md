# Production Deployment (EC2 + RDS + systemd)

This repo now includes deploy templates under `deploy/`:
- `deploy/systemd/*.service`
- `deploy/env/*.env.example`
- `deploy/nginx/flashlight.conf`
- `deploy/scripts/install-systemd-units.sh`

## 1. Create infrastructure

Preferred production shape:
- EC2 instance for app processes
- RDS PostgreSQL for database
- Security groups:
  - Allow `80`/`443` inbound to EC2
  - Allow `5432` inbound to RDS only from EC2 security group

## 2. Create database and `DATABASE_URL`

After RDS is created, build:

```text
postgres://<db_user>:<db_password>@<rds_endpoint>:5432/<db_name>?sslmode=require
```

Do not commit this URL. Put it only in secure env files on the server.

## 3. Amazon credentials

For PA-API, use:
- `AMAZON_ACCESS_KEY_ID`
- `AMAZON_SECRET_ACCESS_KEY`
- `AMAZON_PARTNER_TAG`
- `AMAZON_REGION` (usually `US`)
- `AMAZON_ALLOWED_BRANDS` (recommended)
- `AMAZON_ALLOWED_SELLERS` (recommended)

Create/retrieve keys in AWS IAM for a dedicated service principal. Save the secret once at creation time. Rotate periodically.

## 4. Server bootstrap

On EC2:

```bash
sudo adduser --system --group --home /opt/flashlight-ratings-go flashlight
sudo mkdir -p /opt/flashlight-ratings-go/bin
sudo mkdir -p /etc/flashlight-ratings-go
sudo chown -R flashlight:flashlight /opt/flashlight-ratings-go
sudo chmod 750 /etc/flashlight-ratings-go
```

Deploy this repo to `/opt/flashlight-ratings-go` and build binaries:

```bash
cd /opt/flashlight-ratings-go
go build -o bin/api ./cmd/api
go build -o bin/worker ./cmd/worker
```

Build web app:

```bash
cd /opt/flashlight-ratings-go/web
npm ci
npm run build
```

## 5. Create secure env files on EC2

Copy templates:

```bash
sudo cp /opt/flashlight-ratings-go/deploy/env/api.env.example /etc/flashlight-ratings-go/api.env
sudo cp /opt/flashlight-ratings-go/deploy/env/worker.env.example /etc/flashlight-ratings-go/worker.env
sudo cp /opt/flashlight-ratings-go/deploy/env/web.env.example /etc/flashlight-ratings-go/web.env
```

Edit values:

```bash
sudoedit /etc/flashlight-ratings-go/api.env
sudoedit /etc/flashlight-ratings-go/worker.env
sudoedit /etc/flashlight-ratings-go/web.env
```

Lock down permissions:

```bash
sudo chown root:root /etc/flashlight-ratings-go/*.env
sudo chmod 600 /etc/flashlight-ratings-go/*.env
```

## 6. Install and start systemd units

```bash
cd /opt/flashlight-ratings-go
sudo ./deploy/scripts/install-systemd-units.sh
sudo systemctl enable --now flashlight-api flashlight-worker flashlight-web
```

Check health:

```bash
sudo systemctl status flashlight-api flashlight-worker flashlight-web
journalctl -u flashlight-api -u flashlight-worker -u flashlight-web -f
```

## 7. Configure Nginx

Copy template:

```bash
sudo cp /opt/flashlight-ratings-go/deploy/nginx/flashlight.conf /etc/nginx/sites-available/flashlight
```

Set domain in config (`server_name`), then:

```bash
sudo ln -s /etc/nginx/sites-available/flashlight /etc/nginx/sites-enabled/flashlight
sudo nginx -t
sudo systemctl reload nginx
```

Then issue TLS cert with certbot (recommended) and update Nginx config for HTTPS.

## 8. Run migrations

Apply SQL migrations in order:
- `db/migrations/0001_initial_schema.sql`
- `db/migrations/0002_market_intelligence.sql`
- `db/migrations/0003_flashlight_detail_fields.sql`

Example with `psql`:

```bash
psql "$DATABASE_URL" -f db/migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -f db/migrations/0002_market_intelligence.sql
psql "$DATABASE_URL" -f db/migrations/0003_flashlight_detail_fields.sql
```

## 9. Keep secrets out of GitHub

- Never commit `.env` files (already ignored by `.gitignore`).
- Store CI/deploy secrets in GitHub Actions secrets, not in workflow YAML.
- Minimum secrets set:
  - `PROD_DATABASE_URL`
  - `PROD_AMAZON_ACCESS_KEY_ID`
  - `PROD_AMAZON_SECRET_ACCESS_KEY`
  - `PROD_AMAZON_PARTNER_TAG`
  - `PROD_API_BASE_URL` (for web build/runtime, if needed)
- Rotate compromised keys immediately and redeploy.

## 10. Ongoing deploy command

This repo includes `scripts/deploy.sh` for pull/build/restart on EC2:

```bash
cd /opt/flashlight-ratings-go
sudo ./scripts/deploy.sh
```

What it does:
- `git pull --ff-only` on the current branch
- builds `bin/api` and `bin/worker`
- runs DB migrations if `DATABASE_URL` is available in `/etc/flashlight-ratings-go/api.env`
- runs `npm ci && npm run build` in `web/`
- restarts `flashlight-api`, `flashlight-worker`, `flashlight-web`
