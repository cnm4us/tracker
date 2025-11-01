# Deployment Guide — Dev → Prod (Single Host)

This guide documents how we use Git branches, environment files, and system services to develop in `tracker_dev` and deploy to `tracker_prod` on the same server. It covers the day‑to‑day flow, production build/restart steps, and common troubleshooting.

## Git Workflow

- Branch model
  - `dev`: active development branch (used in the `tracker_dev/` workspace)
  - `main`: production branch (used in the `tracker_prod/` workspace)

- Where merges happen
  - Merge `dev` → `main` in your development workflow (locally or via a Pull Request).
  - Do not merge on the prod box. Prod only fast‑forwards to `origin/main`.

- Update dev workspace (`tracker_dev/`)
  - `git checkout dev`
  - Make changes, commit, push: `git push origin dev`
  - Integrate to main (one option):
    - `git fetch origin`
    - `git checkout dev && git rebase origin/main` (keeps history linear)
    - `git checkout main && git merge --ff-only dev`
    - `git push origin main`

- Update prod workspace (`tracker_prod/`) — no local merges
  - Fast‑forward to the latest production commit:
    - `git fetch origin`
    - `git checkout main`
    - `git pull --ff-only` (or `git reset --hard origin/main`)
  - Handle deletions: a fast‑forward or hard reset applies file deletions from `main` automatically.
  - Remove untracked leftovers (only if you intend a clean tree):
    - `git clean -fd` (dangerous if you have local files; review with `git clean -fdn` first)

- What `--ff-only` means
  - “Fast‑forward only”: update your branch pointer to match `origin/main` without creating a merge commit.
  - If it fails, your local `main` has diverged. Use `git reset --hard origin/main` (recommended on prod) or fix locally in dev and push again.

## Environment and Configuration

- Client (Vite) env files (not committed):
  - `/.env.development` (dev workspace)
  - `/.env.production` (prod workspace)
  - Vite selects the correct file based on mode. The config reads env with `loadEnv(mode, ...)`.
  - Typical dev entries:
    - `VITE_HOST=tracker-dev.bawebtech.com`
    - `VITE_HMR_PROTO=wss`
    - `VITE_HMR_CLIENT_PORT=443`
    - `PORT=3400`
  - Typical prod entries (optional for completeness; `vite build` doesn’t use HMR):
    - `VITE_HOST=tracker.bawebtech.com`

- Server (Express API) env loading
  - The server loads `.env.${NODE_ENV}` first and falls back to `.env` if it does not exist.
  - Production uses a systemd `Environment=NODE_ENV=production` and an `EnvironmentFile` to set:
    - `APP_ORIGIN=https://tracker.bawebtech.com`
    - `API_PORT=3501` (prod API port)
    - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=tracker_prod`

- Systemd unit (prod)
  - File: `/etc/systemd/system/tracker-api.service`
  - Example content:
    ```ini
    [Unit]
    Description=Tracker API (production)
    After=network.target

    [Service]
    WorkingDirectory=/home/ubuntu/tracker_prod
    Environment=NODE_ENV=production
    EnvironmentFile=/home/ubuntu/tracker_prod/.env.production
    ExecStart=/home/ubuntu/.nvm/versions/node/v20.19.5/bin/node /home/ubuntu/tracker_prod/node_modules/tsx/dist/cli.cjs server/src/index.ts
    User=ubuntu
    Group=ubuntu
    Restart=always
    RestartSec=2

    [Install]
    WantedBy=multi-user.target
    ```
  - Enable/start: `sudo systemctl daemon-reload && sudo systemctl enable --now tracker-api`
  - Logs: `journalctl -u tracker-api -f`
  - Health: `curl http://127.0.0.1:$API_PORT/api/health`

- Nginx
  - Dev (domain: `tracker-dev.bawebtech.com`): proxies Vite (3400) and API (3401); HMR over WSS enabled.
  - Prod (domain: `tracker.bawebtech.com`):
    - Serves static SPA: `root /home/ubuntu/tracker_prod/dist;`
    - Proxies API: `location /api/ { proxy_pass http://127.0.0.1:3501; }`
  - Certs via Certbot, using HTTP‑01 challenges at `/.well-known/acme-challenge/`.
  - After editing configs: `sudo nginx -t && sudo systemctl reload nginx`

## Deployment Steps (Prod)

1) Sync code to `origin/main`
   - `cd /home/ubuntu/tracker_prod`
   - `git fetch origin && git checkout main && git pull --ff-only`
   - If pull fails due to divergence: `git reset --hard origin/main`

2) Install deps (when package/lock changes)
   - `npm ci` (installs devDependencies used by `tsx`)

3) Build client
   - `npm run build`
   - Output: `dist/` is served by Nginx

4) Restart API
   - `sudo systemctl restart tracker-api`
   - Validate health: `curl http://127.0.0.1:3501/api/health`

5) Reload Nginx (only if config changed)
   - `sudo nginx -t && sudo systemctl reload nginx`

### Zero‑Downtime Static Swap (optional)

- Prevent clients from ever seeing a partially written `dist/` during builds:
  - `npm run build -- --outDir dist_next`
  - `mv dist dist_prev && mv dist_next dist`
  - Optionally: `rm -rf dist_prev`

## Database: Dev vs Prod

- Databases
  - `tracker_dev`: development DB (copied from `tracker` backup)
  - `tracker_prod`: production DB (schema‑only initially; later stores real data)

- Backup/restore
  - Schema‑only dump: `npm run backup:schema` (or `tsx server/scripts/backup_db.ts --schema`)
  - Import into `tracker_prod`: `mysql -u <user> -p tracker_prod < path/to/schema.sql`
  - Full import: avoid on prod; for dev copies, you can import a full dump into `tracker_dev`.

- Migrations
  - Initial schema: `scripts/migrate.sql`
  - Duration/local‑date: `scripts/migrate_002_duration.sql`
  - User settings columns: `npm run db:migrate:add-recent-logs` and `npm run db:migrate:add-search-default`

## Health, Logs, and Monitoring

- API health endpoint
  - `GET /api/health` → `{"ok": true, "env": "production"}`

- Logs
  - API: `journalctl -u tracker-api -f`
  - Nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`

- Common checks
  - `curl -Is https://tracker.bawebtech.com` → 200 OK
  - `curl http://127.0.0.1:3501/api/health` → ok
  - `systemctl status tracker-api` → active (running)

## Security Checklist

- TLS: Certbot installed; auto‑renew enabled; 80/443 open; 3306 restricted to known IPs
- DB users: least privilege; separate users for dev and prod
- Cookies: `secure` + `SameSite=Lax` via server; `APP_ORIGIN` must match the public HTTPS origin
- Secrets: keep `.env.*` out of Git; use systemd `EnvironmentFile` on prod

## Troubleshooting

- 500 from Nginx for `/` or `/index.html`
  - Check file traversal permissions: Nginx must traverse `/home/ubuntu` to read `dist`
    - Quick fix: `sudo chmod o+x /home/ubuntu`
    - Alternative: add `www-data` to the `ubuntu` group and use group `x` perms.

- API not reachable or wrong port
  - Ensure `API_PORT` is set in the prod environment and matches Nginx’s upstream.
  - Verify loaded env: `systemctl show -p Environment tracker-api`
  - Check API health on loopback.

- Systemd can’t find `tsx`
  - Install dev deps on prod: `npm ci`
  - ExecStart path must use `cli.cjs`: `/node_modules/tsx/dist/cli.cjs`
  - Ensure Node path is absolute (nvm paths are not in systemd’s PATH by default).

- Vite HMR issues on dev
  - Confirm `.env.development` includes `VITE_HOST`, `VITE_HMR_PROTO=wss`, `VITE_HMR_CLIENT_PORT=443`.
  - Verify `vite.config.ts` reads values via `loadEnv`.

## Handy Commands

- Show current env loaded by the API process:
  - `pid=$(systemctl show -p MainPID --value tracker-api); sudo tr '\0' '\n' < /proc/$pid/environ | sort`

- Swap static builds atomically:
  - `npm run build -- --outDir dist_next && mv dist dist_prev && mv dist_next dist`

- Force sync prod to remote main (overwrites local changes):
  - `git fetch origin && git checkout main && git reset --hard origin/main && git clean -fd`

---

If anything here becomes stale as the project evolves, update this document alongside the change so production stays smooth and predictable.

