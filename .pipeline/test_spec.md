# Test Specification

> **⚠️ WARNING — `surface.json` is stale scaffold output.**
> `.pipeline/surface.json` contains only the generic scaffold surface (`GET /health`,
> `GET /trpc/users.findAll`, `GET /trpc/users.findById`) and an Angular `app-root`/`app-home`
> component list. None of it corresponds to the CNC quoting application in the spec.
> Per rule 1 this is treated as a **missing/insufficient** surface file: the API surface below is
> derived from the **Surface contract in `.pipeline/tasks.md`** (authoritative, expressed in the
> scaffolded NestJS + Prisma + tRPC + Angular 19 stack) cross-checked against `<spec>` behaviour.
> The three scaffold routes are still covered (§ *Scaffold / regression*) so the pipeline does not
> silently break the certified stack probe.
>
> **Stack note:** the spec's file paths (`backend/app/**` FastAPI, `frontend/src/pages` React) are
> **not** authoritative. Tests target `backend/src/**` (NestJS, Jest) and
> `frontend/src/app/**` (Angular, Karma/Jest). tRPC procedures are exercised over
> `POST|GET /api/trpc/<procedure>`; assertions on "status" refer to the HTTP status the
> tRPC error formatter maps to (`UNAUTHORIZED`→401, `FORBIDDEN`→403, `BAD_REQUEST`/
> `UNPROCESSABLE_CONTENT`→422, `CONFLICT`→409, `TOO_MANY_REQUESTS`→429).

## Coverage summary
- Total cases: **218** (`TC-205` alone expands to a 33-assertion RBAC matrix)
- API endpoints covered: **40 / 40** (3 from `surface.json` + 37 derived from the `tasks.md` surface contract, since `surface.json` is stale)
- User journeys covered: **25**

### Shared test fixtures (referenced by ID throughout)

These values are **not** fixed by the spec (see `tasks.md` Open questions → "Unspecified values").
They are pinned here so every case is concrete; the implementation's seed defaults may differ, in
which case tests must seed **these** values explicitly rather than relying on seed data.

| ID | Fixture |
| --- | --- |
| `CFG-PRICING` | `setupFeeCents=2500`, `costPerLinearFootCents=150`, `costPerBendCents=75`, `handlingFeeCents=500`, `minimumOrderCents=5000` |
| `CFG-PRICING-MIN` | `setupFeeCents=500`, `costPerLinearFootCents=150`, `costPerBendCents=75`, `handlingFeeCents=100`, `minimumOrderCents=5000` |
| `CFG-MACHINE` | `bedWidthIn=48`, `bedHeightIn=96`, `marginIn=0.5`, `spacingIn=0.25`, `quantityMin=1`, `quantityMax=1000` |
| `CFG-UPLOAD` | `allowedExtensions=[".dxf"]`, `maxUploadBytes=5242880` (5 MiB) |
| `MAT-STEEL` | `16ga Mild Steel`, `sheetWidthIn=48`, `sheetHeightIn=96`, `perSheetCostCents=4200`, `costMultiplier=1.0`, `active=true` |
| `MAT-CHEAP` | `Test Cheap`, `48×96`, `perSheetCostCents=100`, `costMultiplier=1.0`, `active=true` |
| `MAT-MULT` | `Brushed Alu`, `48×96`, `perSheetCostCents=4200`, `costMultiplier=1.35`, `active=true` |
| `MAT-INACTIVE` | `Discontinued`, `48×96`, `perSheetCostCents=4200`, `active=false` |
| `DXF-RECT` | 4×`LINE` closed rectangle, 10 in × 5 in, `$INSUNITS=1`. Expect `cutLengthIn=30.0`, `bbox=(10,5)`, `detectedUnits="in"` |
| `DXF-RECT-MM` | Same rectangle authored as 254 mm × 127 mm, `$INSUNITS=4` |
| `DXF-RECT-CM` | Same rectangle as 25.4 cm × 12.7 cm, `$INSUNITS=5` |
| `DXF-RECT-M` | Same rectangle as 0.254 m × 0.127 m, `$INSUNITS=6` |
| `DXF-RECT-NOUNITS` | Same rectangle as 254 × 127 drawing units, `$INSUNITS=0` (header key absent variant: `DXF-RECT-NOHDR`) |
| `DXF-ARC` | One `CIRCLE` r=5 in + one 90° `ARC` r=4 in, `$INSUNITS=1`. Expect `cutLengthIn≈31.4159+6.2832=37.699` (±0.5 %) |
| `DXF-BULGE` | `LWPOLYLINE`, 4 vertices, one bulge=1.0 (semicircle) segment, `$INSUNITS=1` |
| `DXF-EMPTY` | Valid DXF header, empty modelspace (zero supported entities) |
| `DXF-CORRUPT` | 200 bytes of random binary with a `.dxf` name |
| `DXF-BIG` | Valid `.dxf` of 6 MiB (> `CFG-UPLOAD.maxUploadBytes`) |
| `USER-ADMIN` | First row in an empty `User` table → role `ADMIN` |
| `USER-A` / `USER-B` | Subsequent signups → role `USER`; `USER-B` is the "other owner" for owner-scoping cases |
| `SHIP-STD` | `Standard`, `baseRateCents=1500`, `perSheetRateCents=400`, `active=true`, `sortOrder=1` |

**Derived reference values** (hand-computed; tests assert these exact integers):

- `NEST-1`: `DXF-RECT` (10×5) on `MAT-STEEL` with `CFG-MACHINE` → usable `47×95`,
  `cols=floor(47.25/10.25)=4`, `rows=floor(95.25/5.25)=18`, `perSheet=72`.
- `QUOTE-1`: `NEST-1` @ `quantity=10`, 2 bends/part, `CFG-PRICING` →
  `sheetCount=ceil(10/72)=1`; cut `30×10=300 in = 25 ft → 3750`; bends `2×10=20 → 1500`;
  sheet `1×4200×1.0=4200`; `total = 2500+3750+4200+500+1500 = 12450` cents;
  `minimumOrderApplied=false`; `utilization = (10×50)/4608 = 0.10851`.
- `QUOTE-MIN`: `DXF-RECT` @ `quantity=1`, 0 bends, `MAT-CHEAP`, `CFG-PRICING-MIN` →
  `500 + 375 + 100 + 100 = 1075` → clamped to `5000`; `minimumOrderApplied=true`.
- `NEST-2`: part `20×30`, `quantity=10` → `cols=floor(47.25/20.25)=2`,
  `rows=floor(95.25/30.25)=3`, `perSheet=6`, `sheetCount=2`;
  sheet-1 `utilization=(6×600)/4608=0.78125`, sheet-2 `=(4×600)/4608=0.52083`.

---

## API tests

### Scaffold / regression (from `surface.json`)

#### `GET /health`
- **Happy path**: `TC-001` — unauthenticated `GET /health` → `200`, body `{status:"ok"}`-shaped; must remain public after auth guards land.
- **Validation failures**: n/a (no inputs).
- **Auth failures**: `TC-002` — request with a deliberately malformed `Authorization: Bearer garbage` header still → `200` (route is marked public; the guard must not run).
- **Idempotency / edge cases**: `TC-003` — 5 sequential calls all → `200` and are never rate-limited (health is exempt from the limiter).

#### `GET /trpc/users.findAll`
- **Happy path**: `TC-004` — the scaffold procedure still resolves (or has been deliberately removed). Assert exactly one of: `200` with an array, **or** `404`/`NOT_FOUND` **and** a matching removal note in the diff. A `500` is a failure.
- **Validation failures**: n/a.
- **Auth failures**: `TC-005` — if the procedure survives, it must be behind `JwtAuthGuard`: unauthenticated → `401` (it exposes `User` rows and must not leak emails post-auth).
- **Idempotency / edge cases**: `TC-006` — response contains no `passwordHash` / `password` field for any user.

#### `GET /trpc/users.findById`
- **Happy path**: `TC-007` — as `TC-004`, with input `{id:<USER-A.id>}` → `200` or documented `404`.
- **Validation failures**: `TC-008` — `{id:"not-a-uuid"}` → `400`/`422`, not `500`.
- **Auth failures**: `TC-009` — unauthenticated → `401`; `TC-010` — `USER-A` requesting `USER-B.id` → `403` or `404` (never another user's email).
- **Idempotency / edge cases**: `TC-011` — unknown but well-formed id → `404`, not `500`.

### Health

#### `GET /api/health`
- **Happy path**: `TC-012` — unauthenticated → `200`, `{status:"ok"}`.
- **Validation failures**: n/a.
- **Auth failures**: `TC-013` — public; no token required, no `401` ever.
- **Idempotency / edge cases**: `TC-014` — returns `200` even when Postgres is stopped (liveness must not depend on dependencies).

#### `GET /api/health/deep`
- **Happy path**: `TC-015` — all deps up → `200` with a per-dependency map containing keys `postgresql`, `redis`, `minio`, each `"ok"`.
- **Validation failures**: n/a.
- **Auth failures**: `TC-016` — public, no token required.
- **Idempotency / edge cases**: `TC-017` — Redis container stopped → non-200 (`503`) with `redis:"error"` and `postgresql:"ok"`; `TC-018` — response body contains **no** credential substrings (assert absence of `DATABASE_URL` value, MinIO secret key, and the literal `password`).

### Auth

#### `POST /api/trpc/auth.register`
- **Happy path**: `TC-019` — empty `User` table, `{email:"a@x.io",password:"Sup3rSecret!"}` → `200`, body has `accessToken`, `refreshToken`, `user.role === "ADMIN"`, and **no** `passwordHash`.
  `TC-020` — second registration `{email:"b@x.io",...}` → `200` with `user.role === "USER"`.
  `TC-021` — stored `User.passwordHash` starts with `$2` (bcryptjs) and does not equal the plaintext.
- **Validation failures**: `TC-022` — missing `email` → `422`. `TC-023` — `email:"notanemail"` → `422`. `TC-024` — `password:"short"` (< policy min) → `422`. `TC-025` — `password:null` → `422`. `TC-026` — extra unknown key `{role:"ADMIN"}` supplied by a self-registering user is ignored or rejected; the created user's role is **not** `ADMIN` when a user already exists (privilege-escalation guard).
- **Auth failures**: `TC-027` — public route: no token required, `200` without `Authorization`.
- **Idempotency / edge cases**: `TC-028` — registering `a@x.io` twice → second call `409`, and `User` count stays at 1. `TC-029` — `"A@X.io"` vs `"a@x.io"` → `409` (email uniqueness is case-insensitive) **or** documented case-sensitive behaviour; assert exactly one of the two consistently.

#### `POST /api/trpc/auth.login`
- **Happy path**: `TC-030` — correct credentials → `200` with a fresh `accessToken` (JWT, `exp - iat === 900`) and `refreshToken`; a `RefreshToken` row exists with `tokenHash` = SHA-256 of the returned token (never the token itself).
- **Validation failures**: `TC-031` — missing `password` → `422`. `TC-032` — malformed email → `422`.
- **Auth failures**: `TC-033` — wrong password → `401`. `TC-034` — unknown email → `401` with a body **identical** to `TC-033` (no user enumeration). `TC-035` — 6 consecutive bad-password attempts → still `401` (or `429` if a login limiter exists), never `200`.
- **Idempotency / edge cases**: `TC-036` — two logins issue two distinct refresh tokens and leave two live `RefreshToken` rows.

#### `POST /api/trpc/auth.refresh`
- **Happy path**: `TC-037` — valid refresh token → `200` with a **new** access token and a **new** refresh token, both differing from the inputs; the presented row's `revokedAt` is now set (rotation).
- **Validation failures**: `TC-038` — missing/empty token → `422`.
- **Auth failures**: `TC-039` — token whose row has `expiresAt` in the past → `401`. `TC-040` — token already rotated once (reuse of a revoked token) → `401` and **no** new tokens minted. `TC-041` — a syntactically valid but unknown token → `401`. `TC-042` — token whose JTI is on the Redis denylist → `401`.
- **Idempotency / edge cases**: `TC-043` — replaying the same refresh token twice concurrently yields at most one success; the second → `401` (no token-family fork).

#### `POST /api/trpc/auth.logout`
- **Happy path**: `TC-044` — authed logout → `200`; the presented refresh row has `revokedAt` set and its JTI is present in Redis with a TTL > 0.
- **Validation failures**: `TC-045` — logout with a refresh token belonging to another user → `401`/`403`, and `USER-B`'s row is untouched.
- **Auth failures**: `TC-046` — no access token → `401`.
- **Idempotency / edge cases**: `TC-047` — logging out twice → second call `200` or `401`, never `500`; `TC-048` — after logout, `auth.refresh` with the revoked token → `401`.

#### `POST /api/trpc/auth.me`
- **Happy path**: `TC-049` — authed → `200` with `{id,email,role}`; `TC-050` — `USER-ADMIN` sees `role:"ADMIN"`, `USER-A` sees `role:"USER"`.
- **Validation failures**: n/a (no input).
- **Auth failures**: `TC-051` — no header → `401`. `TC-052` — `Bearer <expired access token>` → `401`. `TC-053` — token signed with the wrong secret → `401`. `TC-054` — `Bearer` with an empty token → `401`.
- **Idempotency / edge cases**: `TC-055` — response never includes `passwordHash`.

### Drawings

#### `POST /api/drawings` (REST, multipart)
- **Happy path**: `TC-056` — `USER-A` uploads `DXF-RECT` → `200` with `{id, bbox:{wIn:10,hIn:5}, cutLengthIn:30.0, polylines:[...]}`; a `Drawing` row exists with `storageKey` matching `^drawings/<USER-A.id>/[0-9a-f-]{36}\.dxf$` and exactly one object exists in the MinIO `drawings` bucket under that key.
  `TC-057` — `DXF-ARC` → `200`, `cutLengthIn` within ±0.5 % of `37.699`.
  `TC-058` — `DXF-BULGE` → `200`, `cutLengthIn` > the straight-chord length (bulge was expanded, not treated as a line).
- **Validation failures** (each asserts the status **and** that the MinIO bucket object count is unchanged **and** no `Drawing` row was created — the spec requires nothing written before parse succeeds):
  `TC-059` — `part.stp` (disallowed extension) → `400`/`422`, bucket unchanged.
  `TC-060` — `part.dxf.exe` (double extension) → `400`/`422`, bucket unchanged.
  `TC-061` — `DXF-BIG` (6 MiB, declared `Content-Length` > cap) → `413`, bucket unchanged, and the request is rejected on the declared size **before** the stream is consumed.
  `TC-062` — a request that lies about `Content-Length` (declares 1 KiB, streams 6 MiB) → `413` via the streamed byte cap, bucket unchanged.
  `TC-063` — `DXF-CORRUPT` → `422` with the parser's message in the body, bucket unchanged.
  `TC-064` — `DXF-EMPTY` (zero supported entities) → `422`, bucket unchanged.
  `TC-065` — zero-byte file → `422`, bucket unchanged.
  `TC-066` — no `file` part in the multipart body → `422`.
  `TC-067` — validation **ordering**: a `.stp` file of 6 MiB returns the extension error (not the size error), proving extension is checked first.
- **Auth failures**: `TC-068` — unauthenticated upload → `401`, bucket unchanged.
- **Idempotency / edge cases**: `TC-069` — uploading the same bytes twice creates two distinct `Drawing` rows with distinct `storageKey`s (no dedup implied). `TC-070` — when MinIO is unconfigured/unreachable → `503` (`ServiceUnconfiguredError`), **not** `500`, and no `Drawing` row. `TC-071` — 11th upload within the limiter window → `429` with a `Retry-After` header.

#### `POST /api/trpc/drawings.byId`
- **Happy path**: `TC-072` — owner fetches own drawing → `200` with bbox, `cutLengthIn`, `detectedUnits`, and flattened `polylines`.
- **Validation failures**: `TC-073` — malformed id → `422`. `TC-074` — unknown id → `404`.
- **Auth failures**: `TC-075` — unauthenticated → `401`. `TC-076` — `USER-B` fetching `USER-A`'s drawing → `403` or `404`, and the response contains no geometry.
- **Idempotency / edge cases**: `TC-077` — response does **not** expose a raw MinIO URL or credentials; `storageKey` alone is acceptable.

### Bends

#### `POST /api/trpc/bends.list`
- **Happy path**: `TC-078` — drawing with 3 bends → `200`, 3 items with `{x1,y1,x2,y2,angleDeg,direction}`, stable ordering.
- **Validation failures**: `TC-079` — unknown `drawingId` → `404`.
- **Auth failures**: `TC-080` — unauthenticated → `401`. `TC-081` — `USER-B` listing `USER-A`'s drawing bends → `403`/`404`.
- **Idempotency / edge cases**: `TC-082` — drawing with no bends → `200` with `[]` (not `404`).

#### `POST /api/trpc/bends.create`
- **Happy path**: `TC-083` — `{drawingId, x1:0,y1:0,x2:10,y2:0, angleDeg:90, direction:"up"}` → `200` with the persisted row; `TC-084` — the DXF object in MinIO is byte-identical before and after (bends never rewrite the stored file).
- **Validation failures**: `TC-085` — `angleDeg:-1` → `422`. `TC-086` — `angleDeg:181` → `422`. `TC-087` — `angleDeg:0` → `200` (inclusive lower bound). `TC-088` — `angleDeg:180` → `200` (inclusive upper bound). `TC-089` — `direction:"sideways"` → `422`. `TC-090` — `direction` missing → `422`. `TC-091` — `angleDeg:"90"` as a string → `422` or coerced consistently; assert no `500`. `TC-092` — missing coordinate `y2` → `422`.
- **Auth failures**: `TC-093` — unauthenticated → `401`. `TC-094` — `USER-B` creating a bend on `USER-A`'s drawing → `403`/`404`, and `USER-A`'s bend count is unchanged.
- **Idempotency / edge cases**: `TC-095` — a zero-length bend (`x1,y1 == x2,y2`) → `422` (degenerate) or documented acceptance; assert consistently.

#### `POST /api/trpc/bends.update`
- **Happy path**: `TC-096` — change `angleDeg` 90 → 45 → `200`, re-read reflects 45.
- **Validation failures**: `TC-097` — update to `angleDeg:200` → `422` and the stored value stays 90. `TC-098` — update `direction:"left"` → `422`. `TC-099` — unknown `bendId` → `404`.
- **Auth failures**: `TC-100` — unauthenticated → `401`. `TC-101` — `USER-B` updating `USER-A`'s bend → `403`/`404`, value unchanged.
- **Idempotency / edge cases**: `TC-102` — updating with the identical payload twice → `200` both times, one row.

#### `POST /api/trpc/bends.delete`
- **Happy path**: `TC-103` — delete → `200`; `bends.list` returns one fewer.
- **Validation failures**: `TC-104` — unknown `bendId` → `404`.
- **Auth failures**: `TC-105` — unauthenticated → `401`. `TC-106` — `USER-B` deleting `USER-A`'s bend → `403`/`404`, row still present.
- **Idempotency / edge cases**: `TC-107` — deleting the parent `Drawing` cascade-deletes its `BendLine` rows (assert zero orphans). `TC-108` — double delete → `404` on the second, never `500`.

### Materials

#### `POST /api/trpc/materials.listActive`
- **Happy path**: `TC-109` — with `MAT-STEEL`, `MAT-CHEAP`, `MAT-INACTIVE` seeded → `200` returning exactly the two active rows; `MAT-INACTIVE.id` is absent.
- **Validation failures**: n/a (no input).
- **Auth failures**: `TC-110` — unauthenticated → `401`.
- **Idempotency / edge cases**: `TC-111` — all materials inactive → `200` with `[]` (the UI, not the API, renders the empty state).

### Quotes

#### `POST /api/trpc/quotes.create`
- **Happy path**: `TC-112` — `QUOTE-1` inputs → `200` with `totalCents === 12450`, `sheetCount === 1`, `bendCount === 20`, `cutLengthIn === 300`, `utilization ≈ 0.10851` (±1e-5), and a `breakdownJson` whose terms are exactly `setup=2500, cut=3750, sheet=4200, handling=500, bends=1500, minimumOrderApplied=false`.
  `TC-113` — `QUOTE-MIN` inputs → `totalCents === 5000`, `minimumOrderApplied === true`.
  `TC-114` — `MAT-MULT` (`costMultiplier=1.35`) @ quantity 10 → sheet term `= round(1×4200×1.35) = 5670` and the total shifts by exactly `+1470`.
  `TC-115` — `pricingSnapshotJson` on the row deep-equals the `pricing` settings document at creation time.
  `TC-116` — **price immutability**: after creating a quote, change `costPerLinearFootCents` to `999` via admin, then `quotes.byId` → `totalCents` is still `12450` and `pricingSnapshotJson` still shows `150`.
- **Validation failures** (quantity boundary matrix against `CFG-MACHINE`, each → `422`, no `Quote` row created):
  `TC-117` `quantity:null`; `TC-118` `quantity:0`; `TC-119` `quantity:-5`; `TC-120` `quantity:0` when `quantityMin=1` (below-min); `TC-121` `quantity:1001` (above-max); `TC-122` `quantity:1.5` (non-integer); `TC-123` `quantity:"10"` string → `422` or consistent coercion, never `500`.
  `TC-124` `quantity:1` (exact min) → `200`. `TC-125` `quantity:1000` (exact max) → `200`.
  `TC-126` — `materialId` = `MAT-INACTIVE.id` → `422` with a "material unavailable"-class message, no `Quote` row.
  `TC-127` — unknown `materialId` → `404`/`422`.
  `TC-128` — unknown `drawingId` → `404`.
  `TC-129` — part larger than usable area (drawing bbox `50×10`, usable `47×95`) → `422` carrying the `PartTooLargeError` message, no `Quote` row.
- **Auth failures**: `TC-130` — unauthenticated → `401`. `TC-131` — quoting `USER-B`'s drawing as `USER-A` → `403`/`404`, no `Quote` row.
- **Idempotency / edge cases**: `TC-132` — two identical calls create two distinct quotes (quotes are not deduped). `TC-133` — exceeding the quote limiter → `429` with `Retry-After`. `TC-134` — a drawing with zero bends prices with `bendCount=0` and a `bends` term of `0`.

#### `POST /api/trpc/quotes.list`
- **Happy path**: `TC-135` — 25 quotes, `{page:1,perPage:10}` → `200` with 10 items plus a total/`hasNext` indicator; `{page:3}` → 5 items. `TC-136` — `sort=createdAt:desc` returns newest first; `sort=totalCents:asc` returns ascending totals.
- **Validation failures**: `TC-137` — `page:0` or `page:-1` → `422` or clamps to 1 (assert consistently). `TC-138` — `perPage:10000` → clamped to a documented max, never an unbounded scan. `TC-139` — `sort:"totalCents; DROP TABLE"` → `422` (allow-list, not string interpolation).
- **Auth failures**: `TC-140` — unauthenticated → `401`. `TC-141` — `USER-A`'s list never contains a quote owned by `USER-B` (owner scoping under paging).
- **Idempotency / edge cases**: `TC-142` — user with no quotes → `200`, empty page, total `0`.

#### `POST /api/trpc/quotes.byId`
- **Happy path**: `TC-143` — owner → `200` with quote + `nestingJson` (placements array, `sheetCount`, per-sheet `utilization`) + `breakdownJson`.
- **Validation failures**: `TC-144` — unknown id → `404`. `TC-145` — malformed id → `422`.
- **Auth failures**: `TC-146` — unauthenticated → `401`. `TC-147` — `USER-B` reading `USER-A`'s quote → `403`/`404`.
- **Idempotency / edge cases**: `TC-148` — `nestingJson.placements` length for `NEST-2` is `6` on sheet 1 and `4` on sheet 2, all `(x,y)` top-left-anchored and within the usable area.

### Checkout

#### `POST /api/trpc/checkout.review`
- **Happy path**: `TC-149` — → `200` with `{materialName, quantity, totalCents}` matching the quote exactly.
- **Validation failures**: `TC-150` — unknown `quoteId` → `404`.
- **Auth failures**: `TC-151` — unauthenticated → `401`. `TC-152` — `USER-B` reviewing `USER-A`'s quote → `403`/`404`.
- **Idempotency / edge cases**: `TC-153` — reviewing an already-ordered quote → `409` or a flag indicating it is already purchased (assert it is not silently re-purchasable).

#### `POST /api/trpc/checkout.shippingMethods`
- **Happy path**: `TC-154` — with `SHIP-STD` active and the quote's `sheetCount=2` → `200` with one method whose computed rate is `1500 + 2×400 = 2300` cents. `TC-155` — methods are returned in `sortOrder`.
- **Validation failures**: `TC-156` — unknown `quoteId` → `404`.
- **Auth failures**: `TC-157` — unauthenticated → `401`. `TC-158` — other user's quote → `403`/`404`.
- **Idempotency / edge cases**: `TC-159` — **all** shipping methods inactive → `409` whose message contains contact-us copy; assert it is `409`, not `200` with `[]`.

#### `POST /api/trpc/checkout.createSession`
- **Happy path**: `TC-160` — with Stripe stubbed to succeed → `200` with a Stripe `url`; **no** `Order` row is created at this point (the webhook creates it).
- **Validation failures**: `TC-161` — missing `shippingMethodId` → `422`. `TC-162` — inactive `shippingMethodId` → `422`. `TC-163` — invalid/incomplete shipping address → `422`, no Stripe call made (assert the stub recorded zero invocations).
- **Auth failures**: `TC-164` — unauthenticated → `401`. `TC-165` — session for `USER-B`'s quote → `403`/`404`.
- **Idempotency / edge cases**: `TC-166` — Stripe stub throws a timeout → `503` with retry copy, **no** `Order`, **no** `WebhookEvent`. `TC-167` — Stripe API key unconfigured (`ServiceUnconfiguredError`) → `503`, not `500`. `TC-168` — checkout limiter exceeded → `429` with `Retry-After`. `TC-169` — creating a session for a quote that already has an `Order` → `409`, no second Stripe session.

#### `POST /api/trpc/checkout.reconcile`
- **Happy path**: `TC-170` — webhook has **not** arrived; stub `retrieveSession` returns a `paid` session → `200` and exactly one `Order` is created with `stripeSessionId` set.
- **Validation failures**: `TC-171` — unknown `sessionId` at Stripe → `404`. `TC-172` — session status `unpaid`/`open` → `200` with a pending indicator and **no** `Order`.
- **Auth failures**: `TC-173` — unauthenticated → `401`. `TC-174` — reconciling a session belonging to `USER-B` as `USER-A` → `403`/`404`, no order visible to `USER-A`.
- **Idempotency / edge cases**: `TC-175` — reconcile, **then** the webhook for the same session arrives → still exactly **one** `Order`; the webhook's `stripeSessionId` unique violation is caught and treated as success (not a `500`). `TC-176` — the reverse order (webhook first, then reconcile) → exactly one `Order`, reconcile returns `200` with that order. `TC-177` — reconcile called twice → one `Order`.

### Webhook

#### `POST /api/webhooks/stripe`
- **Happy path**: `TC-178` — `checkout.session.completed` with a signature produced by the configured secret → `200`; exactly one `Order` (status paid-class, `orderNumber` and `confirmationNumber` populated and unique) and exactly one `WebhookEvent` row.
- **Validation failures**: `TC-179` — body tampered after signing → rejected (`400`), **zero** state change: no `Order`, no `WebhookEvent` (assert both counts are 0). `TC-180` — missing `Stripe-Signature` header → `400`, zero state change. `TC-181` — a signature valid for a *different* secret → `400`, zero state change. `TC-182` — an unhandled event type (e.g. `payment_intent.created`) with a valid signature → `200` no-op, no `Order`.
- **Auth failures**: `TC-183` — no JWT is required; a request with no `Authorization` and a valid signature succeeds (route is public). `TC-184` — a JWT-authed request with an invalid signature is still rejected (auth never substitutes for signature verification).
- **Idempotency / edge cases**: `TC-185` — replaying the identical event (same `event.id`) → exactly **one** `Order` and one `WebhookEvent`; the second call returns `200`. `TC-186` — the webhook route is **exempt** from rate limiting: 100 rapid valid deliveries all return `200`, never `429`. `TC-187` — the raw body is preserved (a body-parser that re-serializes JSON breaks the HMAC): assert a signature computed over the exact raw bytes verifies. `TC-188` — Resend send throws → the `Order` still exists, the response is still `200`, and an error is logged (assert via a logger spy). `TC-189` — Resend unconfigured → same as `TC-188`, order created.

### Orders

#### `POST /api/trpc/orders.list`
- **Happy path**: `TC-190` — owner with 3 orders → `200` with 3 items; paging honoured.
- **Validation failures**: `TC-191` — `status:"bogus"` filter → `422` or an empty result from an allow-list; never a `500`.
- **Auth failures**: `TC-192` — unauthenticated → `401`. `TC-193` — `USER-A`'s list excludes `USER-B`'s orders.
- **Idempotency / edge cases**: `TC-194` — no orders → `200`, empty page.

#### `POST /api/trpc/orders.byId`
- **Happy path**: `TC-195` — owner → `200` with `orderNumber`, `confirmationNumber`, `shippingAddressJson`, `subtotalCents`, `shippingCents`, `totalCents`; `subtotal + shipping === total`.
- **Validation failures**: `TC-196` — unknown id → `404`.
- **Auth failures**: `TC-197` — unauthenticated → `401`. `TC-198` — `USER-B` → `403`/`404`.
- **Idempotency / edge cases**: `TC-199` — the response contains no Stripe secret key and no full card number.

#### `GET /api/orders/:id/receipt`
- **Happy path**: `TC-200` — owner → `200`, `Content-Type: text/html`, body contains the order number, material name, quantity, and the total rendered as currency.
- **Validation failures**: `TC-201` — unknown id → `404`.
- **Auth failures**: `TC-202` — unauthenticated → `401` (receipts must not be world-readable by id). `TC-203` — `USER-B` → `403`/`404`.
- **Idempotency / edge cases**: `TC-204` — two fetches return byte-identical bodies (receipts are stable, not re-priced).

### Admin (RBAC matrix)

> **`TC-205` — RBAC matrix (parameterised, one assertion trio per admin surface).**
> For **each** of `admin.settings.get`, `admin.settings.update`, `admin.materials.list`,
> `admin.materials.create`, `admin.materials.update`, `admin.shipping.list`,
> `admin.shipping.create`, `admin.shipping.update`, `admin.orders.list`,
> `GET /api/admin/settings`, `PATCH /api/admin/settings` (11 surfaces × 3 = 33 assertions):
> unauthenticated → **401**; authenticated `USER-A` (role `USER`) → **403**;
> `USER-ADMIN` → **2xx**. The 401-before-403 ordering is the point: a non-admin must never
> receive a 401 that hides the fact they are authenticated, and an anonymous caller must never
> receive a 403 that leaks the route's existence as admin-only-but-reachable.

#### `admin.settings.get` / `admin.settings.update`
- **Happy path**: `TC-206` — `update` the `pricing` document, then `get` returns exactly the written values; same round-trip for `machine`, `upload`, `business`, and `payment` (5 documents).
- **Validation failures**: `TC-207` — `pricing` with `costPerLinearFootCents:-1` → `422`, stored value unchanged. `TC-208` — `machine` with `quantityMin > quantityMax` → `422`. `TC-209` — `upload` with `maxUploadBytes:0` → `422`. `TC-210` — an unknown document name → `422`.
- **Auth failures**: covered by `TC-205`.
- **Idempotency / edge cases**: `TC-211` — `payment.update` with `stripeSecretKey:"sk_live_abcd1234"` then `payment.get` → the value is **masked** (matches `/•+1234$/` or similar) and the plaintext `sk_live_abcd1234` appears **nowhere** in the response body; the DB value is ciphertext (≠ plaintext). `TC-212` — after changing `APP_SECRET` (simulating key rotation), `payment.get` does not `500`; it falls back to the env-provided Stripe key and reports it as configured.

#### `admin.materials.*` / `admin.shipping.*`
- **Happy path**: `TC-213` — `materials.create` → `200`; appears in `materials.list` (admin sees inactive too) but **not** in `materials.listActive` when `active:false`; `materials.update` toggling `active` flips its presence in `listActive`. Same create/list/update round-trip for `shipping`.
- **Validation failures**: `TC-214` — `materials.create` with `perSheetCostCents:-100` → `422`; with `costMultiplier:0` → `422`; with `sheetWidthIn:0` → `422`; `shipping.create` with `baseRateCents:-1` → `422`. (4 sub-assertions.)
- **Auth failures**: covered by `TC-205`.
- **Idempotency / edge cases**: deactivating a material referenced by an existing quote must **not** alter that quote's stored `totalCents` — covered by `TC-116`.

#### `admin.orders.list`
- **Happy path**: `TC-216` — admin → `200` listing orders across **all** users (not owner-scoped), with paging and a status filter.
- **Validation failures**: `TC-217` — `status:"bogus"` → `422` or an allow-listed empty result, never `500`.
- **Auth failures**: covered by `TC-205` (401 anonymous / 403 non-admin / 200 admin).
- **Idempotency / edge cases**: `TC-218` — the listing includes `USER-B`'s orders when queried by `USER-ADMIN`, proving it is deliberately not owner-scoped, and exposes no Stripe secrets.

#### `GET` / `PATCH /api/admin/settings` (service + integration credentials)
- **Happy path**: covered by `TC-205` (admin → 2xx) and `TC-211`; the `GET` returns one entry per backing service (`postgresql`, `minio`) and per integration with `configured` booleans and masked values.
- **Validation failures**: `TC-210` covers unknown-key rejection (`422`).
- **Auth failures**: covered by `TC-205`.
- **Idempotency / edge cases**: `TC-212` covers `resolveConfig` precedence — env wins; an env value of `PLACEHOLDER_CONFIGURE_IN_SETTINGS` falls through to the `SystemSetting` row; neither set → `configured:false` and the dependent route returns `503`.

### Branding

#### `POST /api/trpc/settings.publicBusiness`
- **Happy path**: `TC-215` — unauthenticated → `200` with **only** `{companyName, logoUrl, primaryColor, accentColor}`.
- **Validation failures**: n/a (no input).
- **Auth failures**: public; no `401` for anonymous callers.
- **Idempotency / edge cases**: the response must **not** contain any key from the `payment` or `contact`-private documents — assert the absence of `stripeSecretKey`, `stripeWebhookSecret`, and any `sk_` substring.

---

## UI / journey tests

### Journey: First signup becomes admin
- **Steps**: navigate to `/signup` on an empty `User` table → fill email/password → submit.
- **Expected outcomes**: redirect to the post-auth landing route; the header shows the **Admin** nav item; `/admin/materials` loads without a forbidden state.
- **Negative path**: with a user already present, a second signup lands **without** the Admin nav item and `/admin/materials` renders the forbidden state.

### Journey: Signup validation and duplicate email
- **Steps**: `/signup` → submit empty form → submit `notanemail` → submit a short password → submit an already-registered email.
- **Expected outcomes**: inline field errors for each client-side case with no network call; the duplicate-email case shows the server's `409` message inline next to the email field, and the user stays on `/signup`.
- **Negative path**: a `500` from the server shows a generic non-field error and leaves the form re-submittable (inputs not cleared).

### Journey: Login and post-auth redirect
- **Steps**: visit `/quotes/abc` while logged out → get bounced to `/login` → log in with valid credentials.
- **Expected outcomes**: after login the app lands back on `/quotes/abc`, not the default landing route; the header shows the user's email.
- **Negative path**: wrong password shows the `401` message inline and the URL stays `/login` with the return-URL preserved.

### Journey: Session refresh and forced logout
- **Steps**: log in → expire the access token → trigger any authed request.
- **Expected outcomes**: the interceptor silently calls `auth.refresh` and retries the original request **once**; the user sees no interruption and the data renders.
- **Negative path**: if refresh returns `401`, the app clears tokens and redirects to `/login`; the retry happens at most once (assert exactly two outbound requests, not a loop).

### Journey: Quote wizard — upload step
- **Steps**: `/quote/new/upload` → drag `DXF-RECT` onto the drop zone → wait for parse.
- **Expected outcomes**: an upload-progress indicator appears; on success the parsed outline renders and the step advances to `/quote/new/material`; reloading `/quote/new/material` restores the uploaded drawing (state was persisted server-side).
- **Negative path**: dropping `part.stp` shows an extension error without a network upload; dropping `DXF-BIG` shows an oversize error naming the 5 MiB limit; dropping `DXF-CORRUPT` shows the server's `422` parse message; in all three the step does **not** advance.

### Journey: Quote wizard — material and quantity
- **Steps**: `/quote/new/material` → open the material select → choose `16ga Mild Steel` → type quantity `10` → continue.
- **Expected outcomes**: only **active** materials are listed (`Discontinued` absent); min/max hints show `1`–`1000`; URL advances to `/quote/new/bends`.
- **Negative path**: quantity `0` and `1001` and empty each block submission with an inline message mirroring the server's `422`; quantity `1.5` is rejected as non-integer.

### Journey: Quote wizard — bend editor
- **Steps**: `/quote/new/bends` → click-drag across the part outline to create a bend → drag an endpoint handle → set angle `90` → toggle direction to `down` → delete a second bend.
- **Expected outcomes**: the bend renders as an orange dashed line on the canvas; the side list gains a row; endpoint drag updates both the canvas and the persisted row; delete removes it from list and canvas; reloading the page restores all bends from the server.
- **Negative path**: typing `181` or `-5` into the angle field shows a client-side validation error and does **not** issue a request; a server `422` rolls the optimistic local state back to the prior value.

### Journey: Quote wizard — review and submit
- **Steps**: `/quote/new/review` → verify the bbox-in-inches readout → submit.
- **Expected outcomes**: the bbox shows `10.00 in × 5.00 in` for `DXF-RECT` (the spec's unit-misdetection safeguard); a breakdown preview is shown; submit navigates to `/quotes/:id` with the created quote rendered.
- **Negative path**: a `422` part-too-large response keeps the user on `/review` and shows the parse/nesting message; a `429` shows a retry-after message rather than a generic failure.

### Journey: DXF unit detection is visible to the operator
- **Steps**: upload `DXF-RECT-MM`, then `DXF-RECT-CM`, then `DXF-RECT-M`, then `DXF-RECT-NOUNITS`, checking the review step each time.
- **Expected outcomes**: all four show a bbox of `10.00 in × 5.00 in`; the detected unit is displayed (`mm`, `cm`, `m`, and `mm` for the absent/0 case).
- **Negative path**: a file whose units cannot be determined still renders a bbox and an explicit "assumed mm" note rather than a blank or `NaN` readout.

### Journey: Quote detail — breakdown and nesting panels
- **Steps**: `/quotes/:id` → click the Breakdown tab → click the Nesting tab → reload the page.
- **Expected outcomes**: the URL becomes `?panel=breakdown` then `?panel=nesting`; after reload the previously selected panel is still active (URL-addressable state round-trips); the breakdown lists setup, cut, sheet, handling, and bends terms summing to the displayed total.
- **Negative path**: `?panel=bogus` falls back to the default panel without crashing.

### Journey: Work bed visualization and laser animation
- **Steps**: open a quote detail with a nesting result → observe the canvas on mount → click **Print Bed** while running → click **Print Bed** again.
- **Expected outcomes**: the animation auto-starts on mount; the bed, sheet outline, part placements, blue solid cut paths, orange dashed bend lines, and labels are all drawn; the first click **stops and resets to the initial frame** (assert the rendered progress returns to 0, not merely pauses); the second click restarts it.
- **Negative path**: a quote with no nesting result renders a static empty bed with no animation and no console error; a very high vertex count falls back to coarser flattening and still completes.

### Journey: Work bed resize never clips or distorts
- **Steps**: render the canvas at 1200×800 → resize the container to 400×300 → resize to 1600×1000.
- **Expected outcomes**: the `ResizeObserver` recomputes the fit transform; at every size all geometry bounds fall inside the viewport and the x/y scale factors are equal (aspect ratio preserved).
- **Negative path**: a zero-height container does not throw or produce `NaN` transforms.

### Journey: Quotes list — paging, sorting, states
- **Steps**: `/quotes` with 25 quotes → page to 3 → change sort to price ascending → reload.
- **Expected outcomes**: URL carries `?page=3&sort=...`; reload restores the same page and sort; rows show total, material, quantity, and date.
- **Negative path**: a user with zero quotes sees an explicit empty state with a call to action; a server error shows an error state with a retry control; the in-flight state shows a loading indicator (all three states asserted distinctly).

### Journey: Checkout review
- **Steps**: from `/quotes/:id` click order → `/checkout/:quoteId/review`.
- **Expected outcomes**: material, quantity, and total match the quote exactly; a continue control leads to `/checkout/:quoteId/shipping`.
- **Negative path**: navigating directly to another user's `/checkout/:quoteId/review` shows a not-found/forbidden state, never another user's price.

### Journey: Checkout shipping
- **Steps**: `/checkout/:quoteId/shipping` → fill the address form → select `Standard` → submit.
- **Expected outcomes**: the shipping rate shown is the per-sheet-computed value (`2300` cents for a 2-sheet quote); submit redirects the browser to the Stripe Checkout URL.
- **Negative path**: with **no active shipping methods** the server's `409` renders a contact-us empty state and the submit control is disabled; a `503` from `createSession` renders a retryable "payment temporarily unavailable" state without navigating away; an incomplete address blocks submission with inline field errors.

### Journey: Successful Stripe payment → order confirmation
- **Steps**: complete Stripe test checkout with card `4242 4242 4242 4242` → land on `/order/confirmation/:orderId`.
- **Expected outcomes**: while the webhook lags, a "finalizing your order" pending state shows and the page polls `checkout.reconcile`; once resolved the order number, confirmation number, total, and a receipt link render; the receipt link opens the HTML receipt.
- **Negative path**: if reconcile keeps returning pending past the retry budget, the page shows a "we'll email you" state rather than spinning forever or showing an error; exactly one order exists regardless of which of webhook/reconcile won.

### Journey: Declined Stripe payment
- **Steps**: complete Stripe test checkout with card `4000 0000 0000 0002`.
- **Expected outcomes**: Stripe shows the decline; returning to the app leaves the quote unpurchased and re-orderable.
- **Negative path**: **no** `Order` row is created and the orders list is unchanged.

### Journey: Orders list and receipt
- **Steps**: `/orders` → filter by status → open an order → open its receipt.
- **Expected outcomes**: `?page=&status=` are URL-addressable and survive reload; the detail shows subtotal + shipping = total and the shipping address.
- **Negative path**: zero orders shows an empty state; a foreign order id shows not-found.

### Journey: Account page
- **Steps**: `/account` while authed → log out.
- **Expected outcomes**: email and role are shown; logout clears tokens, redirects to `/login`, and a browser Back press does **not** restore an authed view (the guard re-runs).
- **Negative path**: `/account` while logged out redirects to `/login`.

### Journey: Admin gating and navigation
- **Steps**: as `USER-A`, look at the header, then navigate directly to `/admin/materials`, `/admin/pricing`, `/admin/orders`, `/admin/business/payment`.
- **Expected outcomes**: no Admin nav item is rendered; each direct navigation shows a **clear forbidden state** (distinct from the login redirect — the user is authenticated, just not authorized).
- **Negative path**: as an anonymous visitor, the same URLs redirect to `/login` (not the forbidden state); as `USER-ADMIN` all four render normally.

### Journey: Admin materials CRUD
- **Steps**: `/admin/materials` → toggle the active/inactive filter → click edit on a row → change `perSheetCostCents` → save → close.
- **Expected outcomes**: the URL becomes `?modal=edit-material&id=...` and a direct load of that URL opens the dialog on the right row; saving updates the table and shows explicit success feedback; the inactive filter changes the visible rows.
- **Negative path**: a negative cost or zero multiplier is blocked client-side with a message mirroring the server's `422`; a server error keeps the dialog open with the entered values intact.

### Journey: Admin pricing, machine, and upload settings
- **Steps**: `/admin/pricing` → change setup fee → save; `/admin/machine` → change bed dimensions and quantity min/max and upload cap → save → reload both pages.
- **Expected outcomes**: values persist across reload; saved feedback is explicit; the new quantity min/max are reflected as hints in the quote wizard.
- **Negative path**: `quantityMin > quantityMax` and a negative fee are blocked client-side; a server `422` renders the field-level message.

### Journey: Admin business tabs (branding / contact / payment / shipping)
- **Steps**: `/admin/business/branding` → set company name and primary/accent colors → save; switch to `/admin/business/payment`; switch to `/admin/business/shipping` and deactivate a method.
- **Expected outcomes**: each tab is its own child route and is directly loadable/reloadable; branding changes apply as CSS custom properties on the document root and the header updates without a full reload; the payment tab shows **masked** secrets (assert the DOM contains no `sk_live_` plaintext and no secret in a `value` attribute) plus a working sandbox-mode toggle.
- **Negative path**: deactivating the last active shipping method makes the customer shipping step render the contact-us `409` state.

### Journey: Admin integration settings and unconfigured banner
- **Steps**: `/admin/settings` with several integrations unconfigured.
- **Expected outcomes**: one row per backing service (`postgresql`, `minio`) and per integration with a configured/unconfigured badge and a per-item credential form using secret inputs; a prominent banner lists every unconfigured item by name.
- **Negative path**: saving a credential flips its badge to configured without ever echoing the plaintext back into the input.

### Journey: Branding applied before and after fetch
- **Steps**: load any page cold with `settings.publicBusiness` slow, then resolved.
- **Expected outcomes**: safe default colors and name render immediately (no flash of unstyled/blank header); once resolved, the company name, logo, and CSS custom properties update in place.
- **Negative path**: if the branding fetch fails outright, defaults persist and no error is surfaced to the customer (failure-tolerant, never blocks first paint).

---

## Data integrity tests

- `DI-01` — **Money is integer cents everywhere.** After any quote or order mutation, every `*Cents` column is an integer; no floating-point value is ever persisted to a money column. Assert `totalCents === setup + cut + sheet + handling + bends` (or `minimumOrderCents` when clamped) with exact integer equality, no epsilon.
- `DI-02` — **Order totals reconcile.** For every `Order`: `subtotalCents + shippingCents === totalCents`, and `subtotalCents === Quote.totalCents` for the linked quote.
- `DI-03` — **Price immutability.** Changing the `pricing` settings document never mutates any existing `Quote.totalCents`, `breakdownJson`, or `pricingSnapshotJson`.
- `DI-04` — **One order per Stripe session.** `Order.stripeSessionId` is unique; after any interleaving of webhook delivery, webhook replay, and reconcile for one session, `SELECT count(*) FROM "Order" WHERE "stripeSessionId"=$1` is exactly `1`.
- `DI-05` — **Webhook idempotency.** `WebhookEvent.stripeEventId` is unique; replaying an event never inserts a second row and never mutates the existing `Order`.
- `DI-06` — **Signature failure is zero-state.** After a tampered-body webhook, both `Order` and `WebhookEvent` counts are unchanged from before the request.
- `DI-07` — **Uploads are transactional against storage.** After every failed upload path (extension, size, parse), the MinIO `drawings` bucket object count and the `Drawing` row count are both unchanged.
- `DI-08` — **No orphaned bends.** Deleting a `Drawing` cascade-deletes its `BendLine` rows; `SELECT count(*) FROM "BendLine" b LEFT JOIN "Drawing" d ON b."drawingId"=d.id WHERE d.id IS NULL` is `0`.
- `DI-09` — **Refresh-token rotation leaves no live duplicates.** After a successful `auth.refresh`, the presented row has `revokedAt` set and the user has exactly one non-revoked, non-expired `RefreshToken` row per device chain.
- `DI-10` — **Secrets at rest are ciphertext.** For every `SystemSetting` key marked secret, the stored `value` does not equal, and does not contain, the plaintext that was written; it decrypts back to exactly that plaintext.
- `DI-11` — **Email uniqueness.** `User.email` is unique; a duplicate insert raises a constraint violation surfaced as `409`, never `500`.
- `DI-12` — **Order and confirmation numbers are unique** across concurrent order creation (assert uniqueness after creating N orders in parallel).
- `DI-13` — **Quote nesting is self-consistent.** For every persisted quote: `sheetCount === ceil(quantity / perSheet)`, `nestingJson.placements.length === quantity`, every placement lies within the usable area, and `0 < utilization <= 1`.
- `DI-14` — **Owner scoping holds at the data layer.** No `Drawing`, `BendLine`, `Quote`, or `Order` is ever returned to a user whose `userId` does not match (assert by seeding two users with overlapping fixtures and sweeping every read surface).
- `DI-15` — **Seed idempotency.** Running the seed twice leaves the same row counts for `SystemSetting`, `Material`, `ShippingMethod`, `ColossusAccount`, and `User`, with `ColossusAccount` shape unchanged.

---

## Out of scope

- **Actual `ezdxf` behaviour.** The spec prescribes Python `ezdxf` (`make_path`, `flattening`, `bbox.extents`); the scaffolded stack is Node. Parser tests assert **geometric outcomes** (cut length, bbox, unit scaling) against the fixture DXFs, not any library-specific API. The library substitution itself is an open question in `tasks.md`, not a test target.
- **SPLINE / ELLIPSE / TEXT / hatch entities.** The spec's supported entity list is `LINE ARC CIRCLE LWPOLYLINE POLYLINE`; the spec is silent on the rest, so their handling is untested (`tasks.md` flags this for confirmation).
- **PDF receipts.** The spec says "PDF/HTML"; `tasks.md` fixes HTML. PDF rendering is untested until the format is confirmed.
- **Polygon/true-shape nesting.** The spec mandates a bounding-box grid packer, so nesting quality/efficiency beyond the stated formula is not asserted.
- **Real Stripe, Resend, and MinIO network calls.** All integration boundaries are stubbed; there are no tests against live third-party services. Card `4242…`/`4000 0000 0000 0002` flows appear only in the manual/E2E journey, not in CI.
- **Default pricing, machine, and upload values.** The spec fixes none of them (`tasks.md` Open questions). Tests seed the fixture values above rather than asserting any particular seed default.
- **Quote expiry policy.** The spec defines no expiry, so no staleness behaviour is tested.
- **`MANAGER` role behaviour.** The stack enum includes it but no app flow assigns it; only `ADMIN` vs `USER` is exercised.
- **Animation frame-rate as a hard number.** "60 FPS" is a target, not a contract; tests assert delta-time-driven progress, correct start/stop/reset semantics, and vertex capping — not measured FPS, which is machine-dependent.
- **Email deliverability and template content.** Only the "failure never blocks the order" contract is tested; rendered email HTML is not asserted.
- **`surface.json` component and `testId` list.** `app-root`/`app-home` and `home-title`/`users-list` etc. belong to the scaffold's demo page, which the spec replaces. Journey tests target the real screens; if the scaffold home page survives, only its non-regression (`TC-004`–`TC-011`) is covered.
