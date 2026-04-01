# TempShield Workspace

## Overview

TempShield is a production-grade SaaS platform for disposable email detection. It provides a developer API to detect disposable/burner email domains, with a full dashboard, API key management, reputation scoring, webhooks, custom blocklists, bulk verification, and an admin panel.

The product is also branded as **LeadCop** for the production deployment at leadcop.io.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/tempshield) with Tailwind CSS, Framer Motion, Recharts, wouter
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec in lib/api-spec)
- **Auth**: Session-based (in-memory session store + HTTP-only cookies)
- **Build**: esbuild (for API server), Vite (for frontend)

## Structure

```text
├── artifacts/
│   ├── api-server/        # Express API server (port 8080, served at /api)
│   └── tempshield/        # React + Vite frontend (served at /)
├── lib/
│   ├── api-spec/          # OpenAPI spec + Orval codegen config
│   ├── api-client-react/  # Generated + extended React Query hooks
│   ├── api-zod/           # Generated Zod schemas from OpenAPI
│   └── db/                # Drizzle ORM schema + DB connection
├── scripts/               # Utility scripts (post-merge.sh etc.)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

- **users** — id, name, email, password (hashed), apiKey, role (USER/ADMIN), plan (text), requestCount, requestLimit, blockFreeEmails (bool), createdAt
- **api_usage** — id, userId, endpoint, email (nullable), domain (nullable), isDisposable (nullable), reputationScore (nullable), timestamp
- **domains** — id, domain, source, createdAt (disposable email domains from GitHub)
- **upgrade_requests** — id, userId, planRequested, status (PENDING/APPROVED/REJECTED), note, invoiceKey, createdAt
- **plan_configs** — id, plan (text), requestLimit, mxDetectLimit, inboxCheckLimit, websiteLimit, pageLimit, namedKeyLimit, mxDetectionEnabled, inboxCheckEnabled, dnsblEnabled, smtpCheckEnabled, inboxSupportEnabled
- **user_websites** — id, userId, domain, createdAt (unique: userId+domain)
- **user_pages** — id, userId, path, createdAt (unique: userId+path)
- **user_api_keys** — id, userId, name, key (unique), createdAt (named secondary API keys)
- **webhooks** — id, userId, url, secret (nullable), enabled, createdAt
- **custom_blocklist** — id, userId, domain, createdAt (unique: userId+domain)
- **payment_settings** — id, gateway (MANUAL/STRIPE/PAYPAL), stripePublishableKey, stripeSecretKey, paypalClientId, paypalClientSecret, updatedAt
- **email_settings** — id, provider, apiKey, fromEmail, fromName, updatedAt

## Rate Limits & Plans

- FREE: 10 requests (configurable via admin)
- BASIC: 1,000/month
- PRO: 10,000/month
- Custom plans configurable via admin panel
- Bulk verification available on BASIC and PRO plans

## Reputation Scoring

Each email check returns a `reputationScore` (0–100):
- Starts at 100
- −60 if disposable domain
- −20 if no MX records
- −15 if inbox unreachable
- −5 if free email provider (gmail, yahoo, etc.)
- Custom blocklist also forces disposable=true
- `blockFreeEmails` user setting: when enabled, free email providers are also treated as disposable

## Free Email Provider Detection

The `isFreeEmail(domain)` function in `lib/reputation.ts` checks against a hardcoded list of 20 providers: gmail.com, yahoo.com, hotmail.com, outlook.com, live.com, icloud.com, aol.com, protonmail.com, proton.me, zoho.com, yandex.com, mail.com, gmx.com, fastmail.com, tutanota.com, hey.com, msn.com, me.com, mac.com, pm.me.

## Key API Routes

**Auth:**
- `POST /api/auth/register` — create account
- `POST /api/auth/login` — login
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — current user

**Email Detection:**
- `POST /api/check-email` — single email check (Bearer key or session)
- `POST /api/check-emails/bulk` — bulk check (BASIC/PRO only)

**User Dashboard:**
- `GET /api/user/dashboard` — full dashboard stats + counts
- `POST /api/user/api-key/regenerate` — regenerate primary API key
- `GET /api/user/api-keys` — list named API keys
- `POST /api/user/api-keys` — create named API key
- `DELETE /api/user/api-keys/:id` — delete named API key
- `GET /api/user/webhooks` — list webhooks (PRO only)
- `POST /api/user/webhooks` — create webhook (PRO only)
- `PATCH /api/user/webhooks/:id` — update webhook
- `DELETE /api/user/webhooks/:id` — delete webhook
- `GET /api/user/blocklist` — list custom blocked domains
- `POST /api/user/blocklist` — add domain to blocklist
- `DELETE /api/user/blocklist/:id` — remove domain from blocklist
- `GET /api/user/usage` — audit log (last 100 checks)
- `GET /api/user/audit-log` — paginated audit log with filters
- `POST /api/user/upgrade` — request plan upgrade
- `GET /api/user/billing` — billing info and upgrade requests
- `GET /api/user/websites` — allowed website origins
- `POST /api/user/websites` — add allowed website
- `DELETE /api/user/websites/:id` — remove allowed website
- `GET /api/user/pages` — allowed pages (Referer path restrictions)
- `POST /api/user/pages` — add allowed page
- `DELETE /api/user/pages/:id` — remove allowed page
- `GET /api/user/settings` — get user settings (blockFreeEmails)
- `PATCH /api/user/settings` — update user settings

**Admin:**
- `GET /api/admin/users` — all users with usage stats
- `PATCH /api/admin/users/:id/plan` — update user plan
- `DELETE /api/admin/users/:id` — delete user
- `POST /api/admin/users/:id/reset-usage` — reset usage counter
- `POST /api/admin/users/:id/revoke-key` — regenerate API key
- `GET /api/admin/upgrade-requests` — upgrade requests queue
- `PATCH /api/admin/upgrade-requests/:id` — approve/reject (with optional invoice upload)
- `POST /api/admin/domains/sync` — sync disposable domains from GitHub
- `GET /api/admin/stats` — platform stats
- `GET /api/admin/plan-config` — all plan configs
- `POST /api/admin/plan-config` — create custom plan
- `PATCH /api/admin/plan-config/:plan` — update plan config
- `DELETE /api/admin/plan-config/:plan` — delete custom plan
- `GET /api/admin/api-keys` — all API keys across users
- `GET /api/admin/revenue` — revenue stats
- `GET /api/admin/payment-settings` — payment gateway config
- `PUT /api/admin/payment-settings` — update payment gateway config

## Security Features

- **Origin restriction**: Browser requests (with Origin/Referer headers) are blocked when no allowed websites are configured for an API key.
- **Page restriction**: If allowed pages are configured, the Referer path must match one of them.
- **Free email blocking**: Per-user toggle (`blockFreeEmails`) that marks free providers as disposable in responses.

## Embed Script

The embed script `artifacts/tempshield/public/temp-email-validator.js` (~2.6 KB minified) can be embedded on customer websites to validate email inputs in real time. It reads the `data-key` attribute from the `<script>` tag to authenticate API calls.

## Webhooks

On every email check, enabled webhooks receive a POST:
```json
{
  "event": "email.detected",
  "email": "user@example.com",
  "domain": "example.com",
  "isDisposable": true,
  "reputationScore": 40,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```
Signed with HMAC-SHA256 in `X-TempShield-Signature: sha256=<hex>` header. PRO plan only.

## Named API Keys (Multi-Key)

- FREE/BASIC: configurable max (default 1)
- PRO+: configurable max (default 10)
- All named keys share the same account quota
- Returned as masked on list; full key only shown once on creation

## Domain Sync

Domains are fetched from: https://github.com/disposable-email-domains/disposable-email-domains
Loaded into memory cache on startup for fast detection. Admin "Sync Now" button updates the DB and refreshes the cache.

## Admin Credentials (dev)

- Email: admin@leadcop.io (or admin@tempshield.io depending on setup)
- Password: admin123

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json`. The `api-client-react` lib uses `composite: true` and must be built (`tsc --build` in lib/api-client-react) before TypeScript project references work. Run `pnpm run typecheck` from root for full check.

## Workflows

- **`artifacts/api-server: API Server`** — Builds and runs the Express server on port 8080
- **`artifacts/tempshield: web`** — Runs the Vite dev server on port 5173

The "Start application" workflow is a combined shortcut but will fail with EADDRINUSE if the individual workflows are already running (which is normal).

## Environment Variables

Required secrets (set via Replit Secrets):
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Secret for express-session
- `STORAGE_URL` — Object storage URL (for invoice uploads)
- `GCS_BUCKET` — GCS bucket name (for invoice PDFs)
- Stripe/PayPal keys if payment is configured via admin panel
