# CNC Quick Quote

Upload a DXF, pick a material, draw your bend lines, and get an itemized price with an
animated work-bed preview of the actual cut path — then pay by card and get a receipt.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 19 (standalone components, signals, `OnPush`), hash-routed SPA |
| Backend | NestJS 11 REST API under `/api`, Swagger at `/api/docs` |
| Database | PostgreSQL via Prisma |
| Object storage | S3-compatible (MinIO) for uploaded DXF files |
| Cache | Redis for rate-limit counters and the refresh-token denylist (optional) |
| Payments | Stripe Checkout (hosted), signature-verified webhooks |
| Email | Resend, for order confirmations |

DXF parsing is a dependency-free TypeScript parser in `backend/src/drawings/`
(`LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE` incl. bulges, and `POLYLINE`/`VERTEX`), reading
`$INSUNITS` and normalising all geometry to inches.

## Local development

```bash
docker compose up -d postgres redis minio   # backing services

cd backend
cp .env.example .env                        # then fill in the values below
npm install
npx prisma migrate deploy
npm run start:dev                           # http://localhost:3000/api/docs

cd ../frontend
npm install
npx ng serve                                # http://localhost:4200 (proxies /api)
```

## Environment

Everything is read from the environment first and falls back to an administrator-saved
value in the `system_settings` table (see **Admin → Services** in the app). A missing
credential answers **503**, never a 500 and never fabricated data.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs access and refresh tokens |
| `APP_SECRET` | recommended | AES-256-GCM key for secrets at rest. **Rotating it makes previously stored Stripe secrets unreadable** — the app then falls back to the env-provided keys |
| `MINIO_ENDPOINT` | for uploads | S3 endpoint, e.g. `http://minio:9000` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | for uploads | Object-storage credentials |
| `REDIS_URL` | optional | Enables shared rate limiting; without it the limiter falls back to an in-process window |
| `STRIPE_SECRET_KEY` | for payments | Stripe API key (or set it in Admin → Business → Payment) |
| `STRIPE_WEBHOOK_SECRET` | for payments | Verifies `POST /api/webhooks/stripe` |
| `RESEND_API_KEY` | optional | Order-confirmation email; failures never block an order |
| `RESEND_FROM_EMAIL` | optional | Sender address for confirmations |
| `FRONTEND_URL` | optional | Comma-separated CORS origins for `ng serve` |
| `COLOSSUS_ACCOUNTS_JSON` | at deploy | Platform-minted logins consumed by `prisma/seed/seed.js` |

## First run

The database ships empty by design — no sample materials, no demo orders.

1. Sign in with a platform-provided account, or register: **the first account created on
   an empty instance becomes `ADMIN`**; everyone after that is a customer.
2. **Admin → Materials** → add at least one material (customers cannot quote without one).
3. **Admin → Business → Shipping** → enable at least one delivery method, otherwise
   checkout answers 409 with a contact-us message.
4. **Admin → Pricing / Machine & uploads** → set your rate card, bed size and limits.
   Defaults are sensible, and every quote freezes the rates in force when it was generated.
5. **Admin → Business → Payment** → paste your Stripe keys to enable checkout.

## API surface

`GET /api/docs` serves the full Swagger document. Highlights:

| Route | Access |
| --- | --- |
| `POST /api/auth/{register,login,refresh}` | public |
| `POST /api/auth/logout`, `GET /api/auth/me` | authenticated |
| `GET /api/health`, `GET /api/health/deep` | public |
| `GET /api/settings/public-business` | public (branding) |
| `POST /api/drawings`, `GET /api/drawings/:id` | authenticated, owner-scoped |
| `GET/POST /api/drawings/:id/bends`, `PATCH/DELETE /api/bends/:id` | authenticated, owner-scoped |
| `GET /api/materials`, `GET /api/settings/config` | authenticated |
| `POST/GET /api/quotes`, `GET /api/quotes/:id` | authenticated, owner-scoped |
| `GET /api/checkout/:quoteId/{review,shipping-methods}`, `POST /api/checkout/:quoteId/session`, `POST /api/checkout/reconcile/:sessionId` | authenticated |
| `POST /api/webhooks/stripe` | public, signature-verified |
| `GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/:id/receipt` | authenticated, owner-scoped |
| `GET/PUT /api/admin/settings/:doc`, `/api/admin/{materials,shipping-methods,orders,services}` | `ADMIN` only |

Unauthenticated requests to admin routes answer **401**; authenticated non-admins get **403**.

## Tests

```bash
cd backend && npx jest        # DXF parser, nesting and pricing unit suites
```

## Notes

- Prices are integer cents end to end; the itemized lines always sum exactly to the total.
- Orders are created only after Stripe confirms payment, by the webhook or by the
  reconcile call the confirmation page makes. Both converge on one row via the unique
  `stripe_session_id`, so a replayed webhook or a slow redirect can never double-charge
  or duplicate an order.
- Nesting is a bounding-box row/column grid packer, as specified — not a polygon nester.
