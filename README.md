# VOLT — Wholesale game top-up API

Reseller platform for shops and Telegram bots. Not a retail storefront.

## Features

- REST API (`/api/v1`) with Bearer / X-API-Key auth
- Prepaid wallet, server-side balance check
- Idempotent orders via `reference`
- Auto-refund on failed delivery (demo fulfilment)
- Admin panel to create resellers, credit balance, rotate keys
- Static docs at `/docs`

## Quick start

```bash
npm install
npm start
# http://localhost:3000
```

### Demo credentials

| Role | Value |
|------|--------|
| Reseller API key | `vt_demo_key_replace_in_production_0001` |
| Admin token | `volt-admin-change-me` |

Set `ADMIN_TOKEN` and optionally `DATA_DIR` in production.

## API summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/me` | Balance |
| GET | `/api/v1/games` | Catalog + wholesale prices |
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders/:id` | Status |

## Render deploy

1. Connect this repo
2. **Web Service**, Node, build: `npm install`, start: `npm start`
3. Env: `ADMIN_TOKEN=strong-secret`
4. Persistent disk (optional) mount at `/var/data` and set `DATA_DIR=/var/data`

## Wire a real supplier

Replace the `setTimeout` demo in `server/api.js` with your Khmer TopUp / supplier HTTP call. Keep the same order status fields so reseller clients do not change.

## Integrations

### Khmer System (ABA / KHQR deposit)
```
KHMER_SYSTEM_SECRET_KEY=sk_live_...
# or ABA_API_KEY
KHMER_SYSTEM_TG_USER_ID=0
KHMER_SYSTEM_PAY_URL=https://pay.khmer-system.com
```
Reseller: `POST /api/v1/deposit/qr` → poll `GET /api/v1/deposit/:id`

### Khmer TopUp (auto game delivery)
```
KHMER_TOPUP_API_KEY=...
KHMER_TOPUP_URL=https://khmer-topup.com/api/v1
```
When set, orders are forwarded to Khmer TopUp after wallet charge.

### Telegram Login
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=YourBot
```
BotFather → `/setdomain` your host. Widget on `/shop` → Telegram tab.

## Menus
- `/shop` — Games · Order · Track · Telegram · API
- `/docs` — Reseller API
- `/dashboard` — Reseller wallet
- `/admin` — Manage resellers
