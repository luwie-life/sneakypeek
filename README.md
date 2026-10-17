# Sneaky Peek

Sneaky Peek, by Luwie Life, lets creators turn a product (a book, course,
template pack, guide and similar) into a short interactive preview page. Visitors
read a free preview, try a quiz or exercise, download free samples, and click
through to the creator's own checkout. Creators see analytics on how far
visitors read and where they drop off.

## Repository layout

- `src/` — React + Vite web app (creator dashboard, AI studio, public pages).
- `server/` — Express + MongoDB API.
- `docs/DEPLOYMENT.md` — production checklist (storage, proxy, health check).
- `docs/BILLING.md` — Flutterwave subscription setup and verification status.

## Local development

Requirements: Node 20+, MongoDB (local or hosted).

```bash
# API
cd server
cp .env.example .env        # then fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev                 # http://localhost:5000

# Web app (in another terminal, from the repository root)
npm install
npm run dev                 # http://localhost:5173, proxies /api to :5000
```

To work without an Anthropic key or Flutterwave account, set
`AI_PROVIDER=mock` and `BILLING_PROVIDER=mock` in `server/.env`. Mock AI
returns deterministic placeholder sections; mock billing simulates checkout
without charging anything. Both are refused in production.

## Tests

```bash
cd server
npm test
```

The API tests start an in-memory MongoDB (`mongodb-memory-server`, downloaded
on first run) and cover the creator journey, access control for locked and
restricted content, billing lifecycle, the Flutterwave client against a fake
HTTP API, AI limits and security checks. There are no frontend unit tests yet;
`npm run build` at the root is the frontend check.

## Configuration

Every server environment variable is listed with its purpose in
`server/.env.example`. The web app reads one optional build-time variable,
`VITE_MARKETING_URL`, for canonical and Open Graph tags.

Never commit `.env` files or real keys.
