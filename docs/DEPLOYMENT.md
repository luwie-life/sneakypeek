# Deployment

This guide covers what a production deployment of Sneaky Peek needs. No
production deployment has been performed as part of the MVP completion work;
treat this as a checklist, not a record of a live environment.

## Architecture

- `server/` — Express API (Node 20+), MongoDB via Mongoose. Entry point
  `server/index.js`; the app itself is built in `server/app.js`.
- Repository root — React + Vite single-page app. `npm run build` writes
  static files to `dist/`.
- The frontend calls the API with relative `/api/...` URLs, so the SPA and the
  API must be served from the same origin. Put both behind one reverse proxy
  (or a platform that supports path routing): serve `dist/` for everything
  except `/api/*`, which proxies to the Node process. Unknown paths must fall
  back to `dist/index.html` so client-side routes such as `/p/:slug` and
  `/s/:slug` work on refresh.

## Build and run

```bash
# Frontend
npm ci
VITE_MARKETING_URL=https://your-marketing-domain npm run build   # outputs dist/

# API
cd server
npm ci --omit=dev
NODE_ENV=production node index.js
```

`VITE_MARKETING_URL` is optional; it defaults to `https://sneakypeek.com` and is
used only for canonical/Open Graph tags in `index.html`.

## Required configuration

See `server/.env.example` for every variable and its purpose. In production
the API refuses to start if any of these are wrong:

- `JWT_SECRET` missing or shorter than 32 characters.
- `MONGODB_URI` missing.
- `APP_URL` missing (used for payment redirects and CORS).
- `BILLING_PROVIDER=mock` or `AI_PROVIDER=mock` without the explicit
  `ALLOW_MOCK_*` override. Do not set those overrides in production.

Set secrets through your host's secret manager, never in the repository.

## Persistent file storage

Uploaded files (covers, free samples, restricted deliverables, source
material) are written to `STORAGE_DIR` (default `server/uploads`). On hosts
with an ephemeral filesystem (most container platforms) this directory is wiped
on every deploy or restart, which would break every uploaded file.

- Mount a persistent volume and point `STORAGE_DIR` at it, and
- run a single API instance, or a shared filesystem across instances.

Object storage (S3, R2, etc.) is not implemented. `server/services/materials/storage.js`
isolates storage behind one class so it can be swapped later.

## Behind a proxy

Set `TRUST_PROXY=1` (or the number of proxy hops) so rate limiting, analytics
deduplication and bot filtering see the real client IP rather than the proxy's.
Set `CORS_ORIGINS` only if the API must also accept browser calls from origins
other than `APP_URL`.

## Health check

`GET /api/health` returns `200 {"ok":true}` when the database is connected and
`503` otherwise. Use it for load-balancer and uptime checks.

## Background work

The API process runs a billing reconciliation job every
`BILLING_RECONCILE_INTERVAL_MINUTES` (default 60). It re-checks active and
past-due subscriptions with Flutterwave so a missed webhook does not leave an
account on the wrong plan. Running more than one instance runs the job on each;
it is idempotent but wastes API calls, so consider setting it to `0` on all but
one instance.

## Admin access

There is no admin sign-up. Promote an existing account in MongoDB:

```js
db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
```

## Billing setup

Follow `docs/BILLING.md` before taking real payments.
