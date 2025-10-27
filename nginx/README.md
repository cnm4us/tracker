# Nginx configs for tracker.bawebtech.com

This folder contains example site configs you can copy to the server.

Files
- 005_tracker.bawebtech.com.dev.conf
  - Proxies `/` to Vite dev on 127.0.0.1:3400 (with WebSocket upgrade for HMR)
  - Proxies `/api/` to Express API on 127.0.0.1:3401
  - Uses existing Certbot certs for HTTPS

- 005_tracker.bawebtech.com.prod.conf
  - Serves the built SPA from `/home/ubuntu/tracker/dist`
  - Proxies `/api/` to Express API on 127.0.0.1:3401
  - Uses existing Certbot certs for HTTPS

How to apply (dev)
1) Copy the dev config to the server (as root):
   - `sudo cp nginx/005_tracker.bawebtech.com.dev.conf /etc/nginx/sites-available/005_tracker.bawebtech.com`
2) Test and reload:
   - `sudo nginx -t && sudo systemctl reload nginx`
3) Run both processes:
   - UI: `npm run dev` (3400)
   - API: `npm run server:dev` (3401)

How to apply (prod)
1) Build the SPA:
   - `npm ci && npm run build` (outputs `dist/`)
2) Copy the prod config:
   - `sudo cp nginx/005_tracker.bawebtech.com.prod.conf /etc/nginx/sites-available/005_tracker.bawebtech.com`
3) Test and reload:
   - `sudo nginx -t && sudo systemctl reload nginx`
4) Ensure the API runs persistently (systemd/PM2), listening on 3401.

Notes
- These configs expect Certbot-managed certs at `/etc/letsencrypt/live/tracker.bawebtech.com/`.
- ACME HTTP-01 challenges are served from `/var/www/certbot`.
- For HMR over HTTPS, Vite is already set to use WSS in `vite.config.ts`.
- Avoid editing files in-place with `tee` when also reading from the same file to prevent truncation.

