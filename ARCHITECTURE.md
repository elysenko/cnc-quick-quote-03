# Architecture

## Stack

This project's platform stack is **fixed** as `enterprise`: Angular 19 (frontend) +
NestJS + tRPC + Prisma + PostgreSQL (backend). This was requested as the sole
platform for this run and was newly scaffolded from the `template-enterprise`
template — the repository was empty (only `README.md`, `.git`, `.github`)
before this run.

> Note: the technical plan for this project describes a Python/FastAPI +
> `ezdxf` + React backend/frontend combination. Per the platform's stack
> contract, the platform-chosen stack (Angular/NestJS/tRPC/Prisma) is fixed
> and takes precedence over any stack named in the plan — the plan's
> **features** (DXF parsing, grid nesting, pricing, Stripe checkout, work-bed
> canvas visualization, bend-line editor, etc.) must be implemented on top of
> this NestJS/Angular stack rather than on FastAPI/React. For DXF parsing
> specifically, use a Node-compatible DXF library (or a thin subprocess/service
> wrapper) in place of `ezdxf` since this is a TypeScript backend.

## Layout

- `frontend/` — Angular 19 SPA (standalone components, signals, `OnPush` change
  detection). Entry component: `frontend/src/app/app.component.ts`
  (`app-root`, carries the `data-testid="app-ready"` readiness landmark — do
  not remove it). Example feature: `frontend/src/app/home/`.
- `backend/` — NestJS REST API mounted under `/api`, documented by Swagger at
  `/api/docs`. Prisma is the ORM (`backend/prisma/`). Modules: `auth/`, `account/`,
  `admin/`, `bends/`, `checkout/`, `config/`, `drawings/`, `health/`, `quotes/`,
  `settings/`, `integrations/`, `common/`.

  > The scaffold's `nestjs-trpc` layer was removed during implementation: it did not
  > compile against the installed `nestjs-trpc@2.13` API (`TrpcModule`/`TrpcRouter`
  > vs. the package's `TRPCModule`/`Router`), and the multipart upload, raw-body
  > Stripe webhook and HTML receipt endpoints all need plain REST anyway. The Angular
  > client calls REST through `frontend/src/app/core/api.service.ts`.
- `.pipeline/surface.json` — machine-readable contract of routes, components,
  and `data-testid`s for downstream test-generation agents. Keep it in sync
  with every route/component/test-id added.
- `.colossus-acceptance.json` — acceptance contract read by the post-deploy
  render gate. `expect_text` must be filled in by the coder once the real
  front page content is known.
- `colossus.yaml` — build manifest read by deploy agents (framework,
  output dir, ports, backend build info). Do not delete.
- `docker-compose.yml` — local dev orchestration (frontend/backend + any
  supporting services the feature work requires, e.g. Postgres, and object
  storage/queue services called for by the plan).

## Next steps for the developer

1. Review env files: copy any `*.env.template` files present under
   `backend/` (or the repo root) to `.env` and fill in real values
   (database URL, JWT secret, Stripe keys, storage/object-store endpoint,
   etc.) as required by the features being implemented.
2. Install dependencies: `npm install` in both `frontend/` and `backend/`.
3. Run database migrations: `npx prisma migrate dev` from `backend/` once the
   Prisma schema is extended for the app's data model (materials, drawings,
   bend lines, quotes, orders, etc.).
4. Start local services: `docker compose up` for Postgres and any other
   backing services, then run `frontend`/`backend` dev servers.
5. Extend `.pipeline/surface.json` with every new route, component, and
   `data-testid` as features are built — the test-generation pipeline only
   knows about what's declared there.
6. Fill in `.colossus-acceptance.json`'s `expect_text` once the real
   front page renders meaningful content (not the template's stub "Users"
   list).

## Template source

- `enterprise` → `template-enterprise/` (from the scaffold template library),
  copied directly into the project root.
