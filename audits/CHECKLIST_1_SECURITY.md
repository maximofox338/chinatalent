# Checklist 1 — Security Audit — Findings

**Subject:** China Talent Bridge — Phase 0 foundation
**Checklist:** `AUDIT_CHECKLISTS.md` → Checklist 1 (Security)
**Auditor:** external security auditor (fresh eyes — did not build this system)
**Access:** read-only repository
**Commit audited:** `13efc43` (Phase 0 complete; `main`, local)
**Date:** 2026-06-25

> **Reading order followed before checking anything:** `ARCHITECTURE.md` → `SCHEMA.sql` →
> `API_CONTRACT.md` → `packages/shared` → the `tsconfig`s → the Express route directory
> (`apps/api/src/`). Plus the migration set (`001..015`), the React frontend (`apps/web/src`),
> `apps/api/src/db/HELPERS.md`, env templates, CI, and the RLS test suite.

> **One-line note on a process gap I hit:** `AUDIT_CHECKLISTS.md` was not in my local tree at
> session start — it lived in `origin/main` (commit `13efc43`, "@architect ETAPA 1"). A `git fetch`
> surfaced it. Worth flagging to the founder: ETAPA 1 (checklist authoring) and ETAPA 2 (this run)
> overlapped; make sure all auditors are on the same synced revision.

---

## How the stack shapes this audit

Supabase exposes Postgres **directly to clients** via the `anon` key + a per-user JWT (`authenticated`
role). The frontend already ships a Supabase client with that anon key (`apps/web/src/lib/supabase.ts`),
and any logged-in user holds a valid JWT. **Therefore Row-Level Security is the _primary_ access-control
boundary, not a backstop** — anything the API's zod schemas strip can still be sent straight to PostgREST.
Two of my findings (SEC-001, SEC-003) are invisible if you only read the Express layer and only become
real when you take the Supabase-direct threat model seriously, which the checklist explicitly tells the
auditor to do (Section C orientation).

---

# Section A — SQL injection

| #   | Item                                                                                                            | Mark     |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- |
| A-1 | Request-derived data passed as bound parameters / builder args, never concatenated **[Critical]**               | **PASS** |
| A-2 | Repo-wide search for raw SQL execution finds no user-input concatenation **[Critical]**                         | **PASS** |
| A-3 | Non-parameterizable identifiers (table/col, ORDER BY, direction) validated against an allow-list **[Critical]** | **PASS** |
| A-4 | `LIKE`/`ILIKE` endpoints escape `%`/`_` **[Minor]**                                                             | **N/A**  |
| A-5 | Dynamic-SQL Postgres functions use `format()` `%I`/`%L` or `USING`, never concatenation **[Critical]**          | **PASS** |
| A-6 | No query assembled from raw request-body keys/values **[Critical]**                                             | **PASS** |

**Evidence / reasoning**

- **A-1/A-2.** All runtime DB access goes through the Supabase JS query builder
  (`.from().select().eq().insert().update().range()`) in `apps/api/src/services/*.ts` — parameterized by
  construction. The only raw `pg` is in `db/migrate.ts` (executes static migration files, no request
  input) and `db/seed.ts` (every value is a `$1`/`$2` bind; the lone `client.query(\`CREATE TABLE …\`)`is a constant). Repo-wide sweep for`.rpc(`, `knex`, `sequelize`, template-literal `query(\`…${}\`)`
  with user input: none.
- **A-3.** `listWorkers`/`listCompanies` hard-code `.order('created_at', …)`; sort field/direction are
  never taken from the request. No user-supplied `ORDER BY`.
- **A-4.** **N/A** — no search / `LIKE`/`ILIKE` endpoint exists in Phase 0 (the trigram indexes exist but
  no route uses them yet). Re-test when the directory search lands in Phase 1.
- **A-5.** The only dynamic SQL is `015`'s `format('ALTER TABLE %I …', t)` over a **hard-coded** table
  array using `%I`. SECURITY DEFINER helpers are static `EXISTS` queries with bound `app_current_user_id()`.
- **A-6.** Services spread `...input` into `.insert()/.update()`, but `input` is the zod-`.strict()`-parsed,
  unknown-key-stripped object — and supabase-js parameterizes regardless. No SQL is built from raw body shape.

**Section A verdict: clean.** This is the strongest section — the query-builder-everywhere discipline
removes classic SQLi entirely.

---

# Section B — Cross-site scripting (XSS)

| #   | Item                                                                                                              | Mark               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| B-1 | Every `dangerouslySetInnerHTML`/`innerHTML`/`document.write` renders sanitized or non-user content **[Critical]** | **PASS**           |
| B-2 | All user-generated content shown to other users renders as text via React escaping **[Critical]**                 | **PASS**           |
| B-3 | Markdown / rich-text disables raw HTML or sanitizes **[Critical]**                                                | **N/A**            |
| B-4 | User-controlled `href`/`src`/`window.location` block `javascript:`/`data:` **[Minor]**                            | **FAIL** → SEC-009 |
| B-5 | Translation output rendered as text, not HTML **[Minor]**                                                         | **N/A**            |
| B-6 | CSP header set in production **[Nice-to-have]**                                                                   | **FAIL** → SEC-006 |
| B-7 | Server error/redirect pages don't reflect raw request input **[Minor]**                                           | **PASS**           |

**Evidence / reasoning**

- **B-1/B-2.** Repo-wide grep across `apps/web`: **zero** `dangerouslySetInnerHTML`, `innerHTML`,
  `insertAdjacentHTML`, `document.write`. All user-influenced values (`profile.fullName`, `user.email`,
  `displayName`, `email` on the Login confirmation) render through normal JSX text escaping
  (`Dashboard.tsx`, `Layout.tsx`, `Login.tsx`). No HTML injection sink exists today.
- **B-3/B-5.** **N/A** — no Markdown/rich-text rendering and no translation rendering implemented in
  Phase 0 (both arrive with Phase-1 messaging). Re-test then.
- **B-4.** **FAIL (latent).** `z.string().url()` accepts `javascript:`/`data:` URIs. Fields
  `avatar_url`, `portfolio_url`, `resume_url` (workers), `website`, `logo_url` (companies) are stored
  unvalidated against scheme. They are **not yet rendered** as `href`/`src` in Phase 0, so it is not
  exploitable today — but it is stored, attacker-controlled, and one `<a href={portfolio_url}>` away
  from stored XSS in Phase 1. See SEC-009.
- **B-6.** No `helmet`, no CSP anywhere (confirmed: not in `apps/api/package.json`, no meta CSP in
  `apps/web`). Nice-to-have for an SPA; see SEC-006.
- **B-7.** Error handler (`middleware/error.ts`) returns fixed strings (`'Internal server error'`,
  `'Route not found'`) — no request echo. `notFound` doesn't reflect the URL.

---

# Section C — Row-Level Security (RLS) coverage

| #    | Item                                                                                                           | Mark                                      |
| ---- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| C-1  | Every user/tenant-owned table has RLS **enabled** — all enumerated, none missed **[Critical]**                 | **PASS**                                  |
| C-2  | Every RLS table has ≥1 policy; posture explicit & matches ARCHITECTURE; deny-all is intentional **[Critical]** | **PASS**                                  |
| C-3  | INSERT policies use `WITH CHECK` (can't insert a row owned by someone else) **[Critical]**                     | **PASS**                                  |
| C-4  | Separate correct SELECT/INSERT/UPDATE/DELETE policies; nothing left wide open or missing **[Critical]**        | **FAIL** → SEC-002, SEC-011               |
| C-5  | No `USING(true)`/`WITH CHECK(true)` on private data (or explicitly justified) **[Critical]**                   | **PASS**                                  |
| C-6  | Ownership predicates tie rows to the authed user; keyed column can't be set to forge ownership **[Critical]**  | **PASS** (ownership) / see SEC-001 caveat |
| C-7  | Every `service_role` path enforces authz in app code; key never shipped to client **[Critical]**               | **PASS**                                  |
| C-8  | `SECURITY DEFINER` functions/views don't leak rows past RLS **[Critical]**                                     | **PASS**                                  |
| C-9  | `anon` vs `authenticated` distinction correct **[Critical]**                                                   | **PASS** (see SEC-007 hardening note)     |
| C-10 | Phase-1 lens: RLS can express multi-party row visibility (worker + company) **[Critical]**                     | **PASS**                                  |

**Structural coverage — all 28 tables**

`015_rls_policies.sql` does `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on an explicit 28-table array, then
grants narrowly (`authenticated` gets DML on all tables filtered by policy; `anon` gets `SELECT` on only
7 public tables; `service_role` keeps `BYPASSRLS`). Every table I enumerated from the migrations carries at
least one policy. Default-deny is real, helpers are `SECURITY DEFINER` with `SET search_path = public,
pg_temp` (no search-path hijack), and they return booleans (no row leakage → C-8 PASS). The RLS test suite
(`__tests__/rls.test.ts`, 21 cases) independently confirms cross-user/cross-tenant isolation for profiles,
listings, applications, messages, engagements, invoices. **This is genuinely good work** — the row-ownership
model is correct and tested.

**Where it fails (column-level + one policy predicate):**

- **C-4 FAIL — `conversation_participants` self-join (SEC-002).** The INSERT policy
  `WITH CHECK (profile_id = app_current_user_id() OR is_conversation_participant(conversation_id))` lets
  any authenticated user insert _their own_ seat into _any_ conversation, after which
  `messages_select` / `message_translations_select` (gated only by `is_conversation_participant`) expose
  the entire thread. The "self" branch was meant for invite-acceptance but is unrestricted. The RLS suite
  tests "a non-participant cannot post/read" but **not** "a non-participant cannot add themselves" — so the
  hole is untested. Messaging isn't wired into the API yet, so this is a Phase-1 blocker rather than a live
  Phase-0 leak.
- **C-4 note — revenue-spine / review write predicates (SEC-011).** `engagements_insert` is gated by
  `is_company_member` (any seat, incl. `recruiter`/`member`), and the snapshotted fee-rate columns are
  client-settable on insert; `reviews_insert`/`disputes_insert` only check `author/raised_by = self`, not
  that the caller is a party to the referenced engagement. Not in the Phase-0 API, but the policies exist
  and under-protect Phase 2.
- **C-6 caveat (SEC-001/SEC-003).** Ownership _cannot be forged_ — `WITH CHECK` pins `id`/`profile_id`/
  `owner_profile_id` to `app_current_user_id()`, so you can't create/point a row at someone else (C-6's
  literal assertion holds → PASS). **But** the same UPDATE policies impose **no column-level restriction**,
  so a user can rewrite privileged columns _within their own row_ — most critically `profiles.role → 'admin'`
  (full-platform escalation, SEC-001) and `worker_profiles.is_verified / company_profiles.is_verified → true`
  (SEC-003). I kept C-6 as PASS on its exact wording but the real risk lives in **Section F** (and is the
  headline of this audit).
- **C-5 justified `USING(true)`s:** `worker_profiles_select` (talent directory, `authenticated` only),
  `company_profiles_select`/`categories`/`skills` (public reference/marketing surface). These are
  public-by-design and match ARCHITECTURE/HELPERS — acceptable.
- **C-7 service_role:** the only privileged path is `companyService.createCompany` bootstrapping the first
  `company_members` seat (RLS can't grant a seat to a company with no admins yet). It is authorized by
  construction (owner set to `userId` one statement earlier) and rolls back the company on failure. Key is
  server-only (`lib/env.ts` `required('SUPABASE_SERVICE_ROLE_KEY')`, used only in `serviceClient`); never in
  `apps/web`.

---

# Section D — Input validation at route boundaries

| #   | Item                                                                                                  | Mark                                   |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D-1 | Every route validates `body`/`query`/`params` against an explicit schema before use **[Critical]**    | **PASS**                               |
| D-2 | Validation enforces types, required, length, enums, email/UUID, numeric ranges **[Minor]**            | **PASS** (see SEC-009 for URL scheme)  |
| D-3 | Unknown/extra fields stripped or rejected (mass-assignment protection) **[Critical]**                 | **PASS** (API layer) / **see SEC-001** |
| D-4 | List endpoints bound pagination to sane maximums **[Minor]**                                          | **PASS**                               |
| D-5 | File uploads validate content-type and size server-side **[Minor]**                                   | **N/A**                                |
| D-6 | Validation failures return `{success:false,error,code}` with no stack trace/internal leak **[Minor]** | **PASS**                               |
| D-7 | ID params validated to expected format before lookup **[Minor]**                                      | **PASS**                               |

**Evidence / reasoning**

- **D-1/D-3.** Every handler runs `parse(zodSchema, …)` before touching data. All body schemas are
  `.strict()` (`auth.ts`, `profiles.ts`, `workers.ts`, `companies.ts`), so unknown keys are **rejected**,
  not silently ignored — a client cannot smuggle `role`, `is_admin`, `is_verified`, `user_id`, etc. through
  the API. `register` constrains `role` to `enum(['worker','employer'])` (no `admin`), and `createProfile`
  pins `id` to the JWT `userId` server-side. **At the Express boundary, mass-assignment is properly closed.**
  ⚠️ The same protection does **not** exist at the Supabase/PostgREST boundary (SEC-001/SEC-003) — and that
  boundary is the primary one for this stack.
- **D-2.** Types/required/length/enum/UUID/range all enforced (e.g. `years_experience` int 0–80,
  `hourly_rate_usd` 0–100000, country `length(2)`, size enum). Gap: `url()` doesn't restrict scheme → SEC-009.
- **D-4.** `parsePaging` caps `limit` to `MAX_LIMIT = 100`, `offset >= 0`, with safe defaults — `.range()`
  is bounded. Good.
- **D-5.** **N/A** — no file uploads in Phase 0 (`resume_url`/`avatar_url` are URL strings, not multipart).
  ARCHITECTURE plans Supabase Storage + signed URLs + scanning for Phase 4; re-test then.
- **D-6/D-7.** `validate.ts` converts `ZodError` → `400 INVALID_INPUT` with a field-path message (no stack);
  unknown server errors are logged server-side and returned as opaque `500` (`error.ts`). `:id` params are
  `z.string().uuid()`-validated before any lookup (`workers.ts`, `companies.ts`).

---

# Section E — Secret leakage

| #   | Item                                                                                                              | Mark                                   |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| E-1 | `.env`/`.env.*` gitignored & uncommitted; git history shows no committed credentials **[Critical]**               | **PASS**                               |
| E-2 | No secrets hardcoded in source (DB strings, JWT secret, service_role, GCP creds, Sentry, API keys) **[Critical]** | **PASS** (see SEC-008 nuance)          |
| E-3 | Built client bundle contains only public values (anon key + URL); no service_role/server secret **[Critical]**    | **PASS** (source-level)                |
| E-4 | Client env vars use public prefix (`VITE_`); only non-sensitive values carry it **[Critical]**                    | **PASS**                               |
| E-5 | Logs / error reporting don't capture tokens, magic-link tokens, passwords, auth headers, PII **[Minor]**          | **PASS**                               |
| E-6 | Error responses never echo secrets/connection details/stack traces in prod **[Minor]**                            | **PASS**                               |
| E-7 | Production source maps not publicly served or confirmed secret-free **[Nice-to-have]**                            | **FAIL (unverifiable)** → SEC-010 note |

**Evidence / reasoning**

- **E-1.** `git ls-files` tracks only `apps/api/.env.example` and `apps/web/.env.example` — **no** real
  `.env`. `git check-ignore` confirms both real `.env` files are ignored; `.gitignore` covers `.env`,
  `dist/`, `*.log`, `coverage/`. `git log --all` shows no `.env` (non-`.example`) ever committed.
- **E-2.** No hardcoded server secrets in source: `lib/env.ts` reads everything from `process.env`; service
  role key only via `required('SUPABASE_SERVICE_ROLE_KEY')`. Repo grep for `eyJ…`/`postgres://`/`service_role`
  in app source: only hit is the supabase-js library's own doc-comments in `node_modules`. **Nuance (SEC-008):**
  `seed.ts` + `HELPERS.md` hardcode `Password123!` for `worker@chinatalent.dev` / `employer@chinatalent.dev`
  — dev seed creds, but real (Supabase password grant works) and `is_verified=true`.
- **E-3/E-4.** `apps/web` references only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`,
  `VITE_SENTRY_DSN` — all public by design. No `service_role` reference anywhere in `apps/web/src`. The
  actual `apps/web/.env` (gitignored) contains exactly those three, and the key decodes to `"role":"anon"`
  (verified — it is the anon key, not service_role). `.env.example` explicitly warns "never put secrets here."
  _(I could not grep a built bundle — `apps/web/dist` is gitkeep-only/not built — so E-3 is asserted at
  source level, which is conclusive given no server secret is referenced in client code.)_
- **E-5.** No token/PII logging: `error.ts` logs only the error object server-side; the auth middleware never
  logs the bearer token; Sentry init (`instrument.ts`) sets no `beforeSend` capturing headers, but also never
  attaches tokens. Reasonable for Phase 0.
- **E-7.** `tsconfig.base.json` sets `"sourceMap": true`; whether prod source maps are publicly served is a
  Vercel/Railway deploy setting I can't verify read-only → recorded as a FAIL-with-note per the checklist's
  "couldn't determine = FAIL" rule. Low risk; confirm at deploy.

---

# Section F — Privilege escalation & access control

| #   | Item                                                                                                                | Mark                         |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| F-1 | Horizontal: swapping a resource ID for another user's is rejected (ownership enforced, not assumed) **[Critical]**  | **PASS**                     |
| F-2 | Vertical: role-gated actions blocked for users without the role **[Critical]**                                      | **FAIL** → SEC-001           |
| F-3 | Acting user's identity & role come from the verified JWT server-side, never client-supplied **[Critical]**          | **FAIL** → SEC-001           |
| F-4 | Profile/resource edit & delete verify caller owns the target (no IDOR) **[Critical]**                               | **PASS**                     |
| F-5 | Company/tenant-internal data not readable by workers (and vice-versa) where it shouldn't be **[Critical]**          | **PASS**                     |
| F-6 | `authenticated` role cannot invoke privileged RPCs/functions it shouldn't **[Critical]**                            | **PASS**                     |
| F-7 | Deactivating/deleting an account revokes its access **[Minor]**                                                     | **PASS**                     |
| F-8 | Phase-1 lens: authz pattern generalizes to multi-party resources without fragile per-endpoint checks **[Critical]** | **PASS w/ caveat** → SEC-002 |

**Evidence / reasoning**

- **F-1/F-4/F-5.** Horizontal access is enforced by RLS: `getWorkerById`/`getCompanyById`/`updateCompany`/
  `updateProfile` all `.eq('id', …)` on the user-scoped client, so a forbidden row returns 0 rows
  (→ 404 via `PGRST116`) and a forbidden write raises `42501` (→ 403 via `error.ts`). Confirmed by the RLS
  suite (worker B can't read/edit worker A's data; non-member can't edit a listing). Identity is never taken
  from a body/header — `getAuth(req).userId` comes from `authClient().auth.getUser(token)`.
- **F-2/F-3 — FAIL (SEC-001, the headline).** The user's **role** is `profiles.role`, and the `profiles`
  UPDATE policy (`profiles_update_self`, `WITH CHECK (id = app_current_user_id() OR is_admin())`) imposes no
  column guard. Via the anon key + their own JWT, any authenticated user can
  `PATCH /rest/v1/profiles?id=eq.<self>` with `{"role":"admin"}` straight to PostgREST — bypassing the
  Express layer entirely. `is_admin()` then returns true everywhere, granting read of **all** profiles (PII),
  **all** `verification_documents` (KYC), **all** financials (`invoices`/`payroll_runs`/`payments`),
  `audit_logs`, plus admin writes (approve own KYC, edit any company/engagement, write `categories`/`skills`).
  So "identity & role from the verified JWT" (F-3) is violated: the role half is a **client-mutable DB column**.
  This is a full-platform vertical-escalation from any account. The API's `.strict()` schemas do _not_ mitigate
  it because the DB is directly reachable.
- **F-6.** SECURITY DEFINER helpers return booleans and are self-scoped to `app_current_user_id()`; the
  `authenticated` grant + RLS means they can't be abused to read others' rows. No user-callable RPC exposes
  privileged writes.
- **F-7.** Sessions are stateless JWTs validated per request via Supabase `getUser`; deleting the auth user
  cascades (`profiles_id_fkey ON DELETE CASCADE`) and getUser then fails → access revoked. (True logout
  revocation is best-effort, which is correct for stateless bearer tokens.)
- **F-8.** The multi-party pattern (applications visible to worker **and** company; offers/engagements to
  both) is expressible and works — **except** the `conversation_participants` self-join (SEC-002), which is
  the one place the pattern is currently unsound for Phase-1 messaging.

---

# Section G — Authentication & session (magic-link specifics)

| #   | Item                                                                                                          | Mark                              |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| G-1 | Magic-link tokens single-use & time-limited (confirm Supabase config, not just defaults) **[Critical]**       | **FAIL (unverifiable)** → SEC-005 |
| G-2 | Magic-link token not logged / can't leak (e.g. via `Referer`) **[Minor]**                                     | **PASS**                          |
| G-3 | Every protected route verifies the JWT (signature, expiry, audience) — not mere token presence **[Critical]** | **PASS**                          |
| G-4 | Supabase `redirectTo` / allowed redirect URLs allow-listed (no open redirect) **[Critical]**                  | **FAIL (unverifiable)** → SEC-005 |
| G-5 | Client session/refresh-token storage choice deliberate; XSS exposure understood **[Minor]**                   | **PASS (w/ note)**                |
| G-6 | Auth endpoints rate-limited against email-bombing / brute force **[Minor]**                                   | **FAIL** → SEC-004                |
| G-7 | App doesn't reveal whether an email is registered (no user enumeration) **[Minor]**                           | **PASS**                          |
| G-8 | CORS allows only known frontend origin(s) — not `*` with credentials **[Critical]**                           | **PASS**                          |
| G-9 | If cookies → CSRF protection; if Bearer → confirm not auto-attached cross-site **[Minor]**                    | **PASS / N/A (Bearer)**           |

**Evidence / reasoning**

- **G-3 — PASS (well done).** `requireAuth` (`middleware/auth.ts`) extracts the bearer token and calls
  `authClient().auth.getUser(token)`, which validates signature + expiry server-side via Supabase; on failure
  it returns `401 INVALID_TOKEN`. It never decodes claims itself and never trusts mere token presence. Every
  protected route is mounted behind `requireAuth` (verified across `auth/profiles/workers/companies`).
- **G-1/G-4 — FAIL (unverifiable, SEC-005).** Token TTL/single-use and the Supabase **Redirect URL allow-list**
  are dashboard settings not present in the repo; per the checklist rule, an unverifiable control is a
  FAIL-with-note. `useAuth.signIn` sends `emailRedirectTo: window.location.origin` (reasonable — bounces to
  the app's own origin), but open-redirect safety depends entirely on the Supabase allow-list being tight.
  Confirm both in the Supabase dashboard before launch.
- **G-2.** Token arrives in the URL hash (`detectSessionInUrl`) — hash fragments aren't sent in `Referer` or
  to the server; not logged anywhere. OK.
- **G-5.** `apps/web/src/lib/supabase.ts` sets `persistSession: true` (localStorage) deliberately and comments
  on it; this is the Supabase default and means a token is readable by any XSS — acceptable **given** no XSS
  sink exists today (Section B), but it raises the stakes on SEC-009 for Phase 1. Note, not a blocker.
- **G-6 — FAIL (SEC-004).** No application-level rate limiting (no `express-rate-limit`/gateway limiter),
  though ARCHITECTURE §6 lists "gateway rate limiting; tighter limits on auth + mutations." Magic-link
  _issuance_ happens client↔Supabase (Supabase applies its own limits), which softens this, but the API's
  mutation endpoints are unthrottled.
- **G-7.** `signInWithOtp` doesn't disclose whether an email exists; the app's own `register`/`me` only reveal
  the _caller's_ own profile state (behind `requireAuth`), so no third-party enumeration.
- **G-8 — PASS (well done).** `app.ts` configures `cors({ origin: env.corsOrigins, methods:[…], allowedHeaders:
['Content-Type','Authorization'] })` with **no credentials** and an env-driven allow-list (default
  `http://localhost:5173`). Not `*`-with-credentials. Just confirm `CORS_ORIGIN` is set to the real frontend
  origin(s) in staging/prod (never `*`).
- **G-9.** Auth is Bearer-token (Authorization header), not cookies — not auto-attached cross-site, so CSRF
  doesn't apply.

---

# Section H — Security: Phase 1 readiness (cross-cutting)

| #   | Item                                                                                                                  | Mark                                   |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| H-1 | Socket.io auth accounted for (authenticated sockets + per-room authz), or explicitly flagged not-built **[Critical]** | **PASS (flagged) w/ caveat** → SEC-002 |
| H-2 | Auth/RLS/validation patterns documented well enough to apply consistently in Phase 1 **[Minor]**                      | **PASS**                               |
| H-3 | No Phase-0 shortcut silently widens access once Phase-1 data shares the same tables/roles **[Critical]**              | **FAIL** → SEC-001, SEC-002, SEC-003   |

**Evidence / reasoning**

- **H-1.** Socket.io is **not yet built** (no socket code in the repo) and is explicitly flagged in
  ARCHITECTURE §7 + RISK-TECH-1 — which satisfies the item. Caveat: the messaging RLS it will sit on already
  has the SEC-002 self-join hole; fix that before sockets ship.
- **H-2 — genuine strength.** `HELPERS.md` is an excellent, table-by-table RLS contract (which client to use,
  how `app_current_user_id()` resolves, the deny-by-default model, per-table access rules). ARCHITECTURE §5/§6
  document the dual-layer authz intent. Phase-1 builders have a real spec to follow.
- **H-3 — FAIL.** The two Criticals are exactly "Phase-0 shortcuts that widen access when Phase-1 data lands":
  (a) SEC-001 — the missing column-guard on `profiles.role` means the moment Phase-1 puts real data behind
  `is_admin()` reads, any user can self-promote to see all of it; (b) SEC-002 — the conversation self-join
  is dormant only because messaging isn't wired up yet. SEC-003 (self-`is_verified`) similarly widens as
  verification starts gating trust/payouts. Also note: `HELPERS.md` frames `profiles` UPDATE as plainly
  "self only (or admin)" — the documentation itself doesn't flag the column-level gap, so the pattern would
  be copied forward.

---

# Appendix — Findings

### SEC-001 — Any authenticated user can self-escalate to platform admin

```
ID:             Security-F-2  (also F-3, C-6 caveat, D-3 boundary, H-3)
Checklist:      Security
Location:       apps/api/src/db/migrations/015_rls_policies.sql:157-160
                (profiles_update_self) + table GRANT at 015:26;
                table def apps/api/src/db/migrations/002_profiles.sql (no column guard / trigger)
Observed:       The profiles UPDATE policy is `USING (id = app_current_user_id() OR is_admin())
                WITH CHECK (same)` with NO column-level restriction, and `authenticated` holds a
                table-wide UPDATE grant. Because Supabase exposes PostgREST directly to clients
                (anon key shipped in apps/web; every user has a JWT), a user can send
                `PATCH /rest/v1/profiles?id=eq.<self>  {"role":"admin"}` straight to the DB,
                bypassing the Express layer. `is_admin()` (015:46) keys solely off profiles.role,
                so the user is now admin everywhere.
Why it matters: Full-platform vertical privilege escalation from ANY account. is_admin() unlocks:
                read all profiles (PII: full_name, phone, country), all verification_documents
                (KYC/passport URLs), all invoices/payroll_runs/payments, audit_logs; and admin
                WRITES — approve one's own KYC, edit any company/engagement, write categories/skills.
                The API's zod .strict() schemas do NOT mitigate this — the DB is reachable without them.
                The RLS test suite checks "can't edit ANOTHER user's profile" but never "can't set
                role=admin on OWN profile", so it's both real and untested.
Severity:       Critical  (as suggested)
Phase 1 impact: YES — blocks. Must be fixed before any real user data lands (and before Phase 1
                builds is_admin()-gated reads). Fix is small: forbid self-writes to `role` — e.g.
                a BEFORE UPDATE trigger pinning role/is_active/is_verified unless is_admin(), or
                REVOKE UPDATE(role) ON profiles FROM authenticated (column privilege), so the
                WITH CHECK is no longer the only thing standing between a user and admin.
```

### SEC-002 — Any user can join any conversation and read its messages

```
ID:             Security-C-4  (also F-8, H-1, H-3)
Checklist:      Security
Location:       apps/api/src/db/migrations/015_rls_policies.sql:323-325
                (conv_participants_insert); read paths messages_select 015:330-332,
                message_translations_select 015:341-347
Observed:       conv_participants_insert is `WITH CHECK (profile_id = app_current_user_id()
                OR is_conversation_participant(conversation_id))`. The first branch lets a user
                insert THEIR OWN seat into ANY conversation_id with no invitation/relationship check.
                Once seated, is_conversation_participant() is true, so messages_select and
                message_translations_select expose the whole thread; messages_insert then lets them
                post into it.
Why it matters: Broken access control on private messaging — confidential worker↔company negotiation
                threads become readable/writable by any authenticated stranger who guesses/enumerates
                a conversation UUID. Dormant only because messaging isn't wired into the API yet; it
                is the RLS foundation Phase-1 messaging + Socket.io will sit on. The RLS suite tests
                non-participant read/post denial but not self-join, so it's untested.
Severity:       Critical  (as suggested)
Phase 1 impact: YES — blocks Phase-1 messaging. Fix: the self-insert branch must require an
                invitation/authorized relationship (e.g. only the conversation creator adds
                participants, or a server-side/service-role-mediated join), not bare profile_id = self.
```

### SEC-003 — Trust flags (`is_verified`) are self-settable via direct PostgREST

```
ID:             Security-C-6 / Security-D-3 (DB boundary)
Checklist:      Security
Location:       015_rls_policies.sql:184-187 (worker_profiles_update_self),
                015:208-211 (company_profiles_update_admin); columns in
                004_worker_profiles.sql:214 and 005_company_profiles.sql:264
Observed:       Same column-level gap as SEC-001. worker_profiles UPDATE WITH CHECK is
                (profile_id = self OR is_admin) — a worker can set their own is_verified=true.
                company_profiles UPDATE WITH CHECK is (is_company_admin OR is_admin) — a company
                admin can set their own company is_verified=true. The API never exposes these fields
                (workerSchema/updateSchema are .strict() and omit them), but PostgREST is reachable
                directly. (`is_active` on profiles is in the same class.)
Why it matters: Self-awarded "verified" badges undermine trust & safety. Cosmetic in Phase 0, but
                ARCHITECTURE/RISK-LEGAL-4 gate payouts and trust on verification status later — at
                which point this becomes High/Critical. Same root cause as SEC-001; fix together.
Severity:       Minor (Phase 0)  — note: escalates to Critical once verification gates money/trust.
Phase 1 impact: No (Phase 0) / unsure — fix alongside SEC-001 (one column-guard mechanism covers both).
```

### SEC-004 — No application-level rate limiting

```
ID:             Security-G-6
Checklist:      Security
Location:       apps/api/src/app.ts (middleware chain); apps/api/package.json (no limiter dep)
Observed:       No express-rate-limit / gateway limiter on auth or mutation endpoints. ARCHITECTURE
                §6 promises "gateway rate limiting; tighter limits on auth + mutations" — not implemented.
Why it matters: Mutation endpoints (register/profile/company writes) are unthrottled → brute force /
                abuse / resource exhaustion. Softened because magic-link issuance is client↔Supabase
                (Supabase rate-limits that), but the API surface itself is open.
Severity:       Minor  (as suggested)
Phase 1 impact: No — add before public launch; Railway-level or express-rate-limit on auth + writes.
```

### SEC-005 — Magic-link TTL/single-use and redirect allow-list not verifiable from repo

```
ID:             Security-G-1 / Security-G-4
Checklist:      Security
Location:       Supabase dashboard (not in repo); related: apps/web/src/hooks/useAuth.tsx:61
                (emailRedirectTo: window.location.origin)
Observed:       Token expiry/single-use and the Supabase "Redirect URLs" allow-list are dashboard
                config absent from the repository, so I cannot confirm them read-only. Per the
                checklist's "couldn't determine = FAIL with note" rule, recorded as FAIL.
Why it matters: If the redirect allow-list is permissive, the auth flow enables open redirect /
                token-leak-to-attacker-origin; if tokens aren't single-use/short-lived, link replay.
                Supabase defaults are sane (single-use, ~1h) and emailRedirectTo uses the app's own
                origin, so real risk is likely low — but it must be confirmed, not assumed.
Severity:       Minor  (lowered from suggested Critical: defaults are sane and the code uses
                same-origin redirect; the residual risk is "unconfirmed config", not a known hole)
Phase 1 impact: No — verify in the Supabase dashboard before launch and record the result.
```

### SEC-006 — No security headers / Content-Security-Policy

```
ID:             Security-B-6
Checklist:      Security
Location:       apps/api/src/app.ts (no helmet); apps/web (no CSP meta / config)
Observed:       No helmet, no CSP, no HSTS/X-Frame-Options/etc. set by the app.
Why it matters: Defense-in-depth — a CSP would blunt SEC-009-style stored-XSS in Phase 1 and reduce
                token-theft impact given localStorage sessions (G-5). Hosting (Vercel/Railway) may add
                some headers, but the app sets none itself.
Severity:       Nice-to-have  (as suggested)
Phase 1 impact: No — add helmet on the API and a CSP for the SPA before Phase-1 user content renders.
```

### SEC-007 — Test-only identity GUC backdoor ships in production migrations

```
ID:             Security-C-9 (hardening)
Checklist:      Security
Location:       apps/api/src/db/migrations/001_extensions_and_helpers.sql:70-79 (app_current_user_id)
Observed:       app_current_user_id() COALESCEs the JWT `sub` claim with a fallback GUC
                current_setting('app.current_user_id'), which the RLS test suite uses to impersonate
                users. This fallback is present in the production schema.
Why it matters: If anything could set `app.current_user_id` in an untrusted session, RLS identity is
                forgeable. In practice it is NOT reachable via PostgREST/anon (no arbitrary SET over
                supabase-js/PostgREST) and the JWT sub takes precedence when present, so exploitability
                is low — but a test hook in prod migrations is avoidable.
Severity:       Nice-to-have  (lowered from any implied higher: not reachable by untrusted clients)
Phase 1 impact: No — gate the GUC fallback to non-production, or ensure the GUC is never grantable to
                anon/authenticated.
```

### SEC-008 — Hardcoded seed credentials with verified status

```
ID:             Security-E-2 (nuance)
Checklist:      Security
Location:       apps/api/src/db/seed.ts:41-43 (Password123!) ; documented in
                apps/api/src/db/HELPERS.md:180-183
Observed:       seed.ts creates worker@chinatalent.dev / employer@chinatalent.dev with the literal
                password 'Password123!', and the worker is seeded is_verified=true. Per project memory,
                Supabase password-grant works for these accounts (real, loggable-in).
Why it matters: Dev convenience, but if `npm run seed` is ever pointed at a staging/prod Supabase, these
                become known-good, pre-verified logins (a backdoor). The credential is committed in
                source + docs.
Severity:       Minor  (dev-only by intent; would be Critical if run against a real environment)
Phase 1 impact: No — ensure seed only ever targets local/throwaway DBs; never seed shared environments.
```

### SEC-009 — `url()` validation permits `javascript:` / `data:` URIs (latent stored XSS)

```
ID:             Security-B-4 (also Security-D-2)
Checklist:      Security
Location:       apps/api/src/api/profiles.ts:23 (avatar_url), workers.ts:41-42
                (portfolio_url, resume_url), companies.ts:33,38 (website, logo_url)
Observed:       z.string().url() accepts javascript:/data: schemes (the WHATWG URL parser treats them
                as valid). These attacker-controlled URLs are stored as-is. Not yet rendered as
                href/src in Phase 0, so not currently exploitable.
Why it matters: When Phase 1 renders a profile/company link or avatar (`<a href={portfolio_url}>` /
                `<img src={avatar_url}>`), a javascript: URI becomes stored XSS — amplified by the
                localStorage session (G-5) being readable by that XSS.
Severity:       Minor  (latent; becomes Critical the moment these fields are rendered as href/src)
Phase 1 impact: No (Phase 0) — restrict the schema to http(s) (e.g. .url().startsWith('https://') or a
                scheme refine) AND validate scheme at render time before Phase 1 surfaces these.
```

### SEC-010 — CI lacks dependency/secret scanning; runs only on PR (observation)

```
ID:             Security-E-7 (note) / cross-cutting
Checklist:      Security  (overlaps Checklist 2 A-4 — flagged for the architecture auditor too)
Location:       .github/workflows/ci.yml (lint/typecheck/test only; on: pull_request)
Observed:       CI has no `npm audit` / dependency-CVE gate and no secret-scanning; it triggers only on
                pull_request to main, so a direct push to main skips all checks. Prod source-map
                exposure (E-7) is also unverified here.
Why it matters: Vulnerable transitive deps and accidentally committed secrets could land unflagged;
                direct-to-main pushes bypass the gate entirely.
Severity:       Nice-to-have
Phase 1 impact: No — add `npm audit --audit-level=high` + secret scan; protect main / run CI on push.
```

### SEC-011 — Revenue-spine & review/dispute write policies under-scoped (Phase 2, latent)

```
ID:             Security-C-4 (Phase 2)
Checklist:      Security
Location:       015_rls_policies.sql:299-301 (engagements_insert), 414-416 (reviews_insert),
                427-429 (disputes_insert)
Observed:       engagements_insert is gated by is_company_member (ANY seat, incl. recruiter/member),
                and the snapshotted fee-rate columns (placement/recurring/payroll_fee_rate) are
                client-settable on insert. reviews_insert / disputes_insert only check
                author/raised_by = self, not that the caller is a party to the referenced engagement.
Why it matters: A low-privilege company seat could create engagements with manipulated fee rates
                (e.g. placement_fee_rate = 0); any user could fabricate reviews/disputes against
                arbitrary engagements. Not reachable via the Phase-0 API, but the policies exist now
                and will under-protect Phase 2 (hiring/money/trust).
Severity:       Minor  (Phase 2; no Phase-0 exposure)
Phase 1 impact: No — tighten when offers/engagements/reviews endpoints are built (gate engagement
                writes to owner/admin; require engagement participation for reviews/disputes).
```

---

# Summary

### Per-item marks (43 items across A–H)

| Section                  |  PASS  |  FAIL  |  N/A  | Items  |
| ------------------------ | :----: | :----: | :---: | :----: | --- |
| A — SQL injection        |   5    |   0    |   1   |   6    |
| B — XSS                  |   4    |   2    |   1   |   7    |
| C — RLS                  |   9    |   1    |   0   |   10   |
| D — Input validation     |   6    |   0    |   1   |   7    |
| E — Secret leakage       |   6    |   1    |   0   |   7    |
| F — Privilege escalation |   6    |   2    |   0   |   8    |
| G — Auth & session       |   6    |   3    |   0   |   9    | \*  |
| H — Phase-1 readiness    |   2    |   1    |   0   |   3    |
| **Total**                | **44** | **10** | **4** | **57** |

\* G-9 counted as a single PASS/N/A (Bearer-token, CSRF not applicable).
Some FAILs share one root cause across sections (SEC-001 spans F-2/F-3/H-3; SEC-002 spans C-4/H-3),
so the **10 item-level FAILs map to 11 distinct findings (SEC-001…SEC-011)** below.

### Distinct findings by severity

| Severity         | Count  | IDs                                                               |
| ---------------- | :----: | ----------------------------------------------------------------- |
| **Critical**     | **2**  | SEC-001 (admin self-escalation), SEC-002 (conversation self-join) |
| **Minor**        | **6**  | SEC-003, SEC-004, SEC-005, SEC-008, SEC-009, SEC-011              |
| **Nice-to-have** | **3**  | SEC-006, SEC-007, SEC-010                                         |
| **Total**        | **11** |                                                                   |

### What's genuinely strong (so it isn't lost in the findings)

- **No SQL injection** — query-builder-everywhere + parameterized seeds.
- **RLS structurally complete** — enabled **and FORCED** on all 28 tables, default-deny, `SECURITY DEFINER`
  helpers with pinned `search_path`, and a real 21-test policy suite proving cross-tenant isolation.
- **Clean secret hygiene** — no committed `.env`, no server secret in client code, correct `VITE_` discipline.
- **Solid Express boundary** — every route behind `requireAuth` (real JWT verification via Supabase), zod
  `.strict()` validation, uniform `{success,error,code}` envelope, no internal leakage, sane CORS (no
  `*`+credentials), bounded pagination.
- **Excellent docs** — `HELPERS.md` makes the RLS contract followable for Phase-1 builders.

The two Criticals are the **same class of bug** (RLS authorizes the _row_ but not the _columns/predicate
within it_) and both have **small, surgical fixes** — a column guard on `profiles`/`*_profiles`, and a
tighter `conversation_participants` insert predicate. This is not a structural redesign.

---

## Verdict

> **Is it safe to build Phase 1 on this foundation? — `yes-with-fixes`.**

The architecture is sound and the foundation is well-built, but it is **not** safe to put real user data
on it or to start Phase 1 until **SEC-001 and SEC-002 are fixed** (and ideally SEC-003, same root cause).
SEC-001 in particular is a full-platform compromise reachable from any account the moment real data exists.
Fix the two Criticals — both are small, well-understood changes — and re-run the relevant RLS tests
(adding the two missing cases: "cannot self-set role/is_verified" and "cannot self-join a conversation"),
and this foundation is ready to build on.
