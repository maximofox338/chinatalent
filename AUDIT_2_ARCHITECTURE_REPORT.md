# Audit Report — Checklist 2: Architecture

**Auditor:** External architecture auditor (fresh eyes — did not build this system)
**Access:** Read-only repository
**Date:** 2026-06-25
**Commit audited:** `13efc43` (main) — Phase 0 complete
**Instrument:** `AUDIT_CHECKLISTS.md` → Checklist 2 (Architecture), sections A–E
**Question behind every section:** _Is it safe to build Phase 1 (listings, applications, messaging) on this foundation as it stands today?_

---

## How to read this report

Every item is marked **PASS / FAIL / N/A** with a one-line basis. Each **FAIL**
gets a full finding using the Appendix template. Severities are the checklist's
suggested tags unless I note a change (the checklist permits the auditor to
raise/lower with justification).

**Verification I ran (read-only):** `npm run typecheck`, `npm run lint`,
`npm run build`, `npm audit`, the mocked unit suite (`vitest run` on the two
no-DB test files), plus repo-wide greps for escape hatches / debug logging /
TODOs and a table-set diff between `SCHEMA.sql` and the migrations. The live
`rls.test.ts` suite was **not** run (needs live Supabase creds I don't have, and
running it isn't required to judge architecture).

---

# Summary

| Section                             | Items  | PASS   | FAIL   | N/A   |
| ----------------------------------- | ------ | ------ | ------ | ----- |
| A — Technical debt & code health    | 8      | 7      | 1      | 0     |
| B — Maintainability                 | 7      | 5      | 2      | 0     |
| C — Shared-type consistency         | 7      | 0      | 7      | 0     |
| D — Presentation / logic separation | 7      | 6      | 1      | 0     |
| E — Phase 1 readiness               | 7      | 5      | 2      | 0     |
| **Total**                           | **36** | **23** | **13** | **0** |

**Findings by severity:** 1 Critical · 10 Minor · 2 Nice-to-have

| Severity         | Count | IDs                                                                                                |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------- |
| **Critical**     | 1     | Arch-C-1                                                                                           |
| **Minor**        | 10    | Arch-A-5, Arch-B-1, Arch-B-7, Arch-C-2, Arch-C-3, Arch-C-4, Arch-C-5, Arch-C-6, Arch-C-7, Arch-E-3 |
| **Nice-to-have** | 2     | Arch-D-7, Arch-E-5                                                                                 |

> One Critical-tagged item (E3, messaging real-time) **failed but I lowered it to
> Minor** — justification in the finding. One Minor-tagged item with broad blast
> radius (C7, no type-sync mechanism) I left Minor but flag as the _strategic_
> risk behind the whole C section.

## Verdict

### 🟡 yes-with-fixes

The foundation is **healthy and well-built**: TypeScript strict everywhere,
clean lint/typecheck/build, **0 dependency vulnerabilities**, a properly
normalized 27-table schema that _already_ contains the Phase 1 tables
(`listings`, `applications`, `conversations`/`messages`) with sensible indexes,
comprehensive **RLS that already expresses multi-party visibility** (an
application is visible to both the worker and the hiring company; a message to
its conversation participants), clean route→service→DB layering, and a frontend
with a real hooks/data-layer separation. Phase 1 can be built on this without
restructuring Phase 0.

The **one Critical** problem is concentrated in exactly one place the team
already half-suspected: **`packages/shared` is stale top-to-bottom.** It models
an obsolete pre-ADR-002 domain (`Project`/`Job`/`Offer`/`Employment`) that no
longer exists, uses `camelCase` while the API is `snake_case`, has an `ErrorCode`
union that disagrees with the real codes, and **already causes a confirmed
runtime bug** (the dashboard greets "there" instead of the user's name, because
the frontend reads `profile.fullName` from a payload that actually carries
`full_name`). This compiles green — TypeScript can't catch it — which is what
makes it dangerous. It is **cheap to fix** but **must be fixed before Phase 1**,
because adding listing/application/message types onto a package with no
sync mechanism will compound the drift across the whole marketplace.

Secondary: messaging's **real-time layer is entirely greenfield** (no Socket.io
dependency, no socket-auth design) — net-new work, not a Phase 0 flaw, but it
needs a design before the messaging slice of Phase 1 starts.

**Fix `packages/shared` (and reconcile error codes + enums + a sync pattern),
design Socket.io auth, then build Phase 1.** Nothing here forces you to rewrite
Phase 0.

---

# Checklist 2 — Architecture Audit

## Section A — Technical debt & code health

| #   | Item                                                              | Severity | Result   | Basis                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | TS strict mode on in every tsconfig                               | Minor    | **PASS** | `tsconfig.base.json` has `"strict": true` + `noImplicitOverride`, `noFallthroughCasesInSwitch`; all three projects `extend` it.                                                                |
| A2  | Escape hatches (`any`/`as any`/`@ts-ignore`/`!`) rare & justified | Minor    | **PASS** | Repo-wide grep: **zero** `as any`/`@ts-ignore`/`@ts-nocheck` in app source. Every `any` hit is the word "any" in a prose comment. `as` casts are narrow DB-row casts at the Supabase boundary. |
| A3  | build, lint, `tsc --noEmit` all pass cleanly                      | Minor    | **PASS** | Ran all three: `typecheck` exit 0, `lint` exit 0, `build` exit 0 (one non-blocking 529 kB bundle-size warning — see Arch-D note, not a failure).                                               |
| A4  | `npm audit` clean; lockfile committed; no obviously unused deps   | Minor    | **PASS** | `npm audit` → **found 0 vulnerabilities**. `package-lock.json` committed. Dependency lists are lean and all appear used.                                                                       |
| A5  | Coverage measured & >80%; tests assert behavior                   | Minor    | **FAIL** | See **Arch-A-5**. Tests that exist assert real behavior (good), but coverage is **not measured anywhere** and the frontend has **zero tests**.                                                 |
| A6  | Uniform error handling `{success,error,code}`                     | Minor    | **PASS** | Single envelope (`utils/http.ts`), central `errorHandler` + `toApiError`; unknown errors logged server-side and returned as opaque 500 — never leaked raw.                                     |
| A7  | Dead code / commented blocks / stray debug logging minimal        | Nice     | **PASS** | `console.log` appears only in operational scripts (`migrate.ts`, `seed.ts`, `index.ts` startup, `instrument.ts`, `test-connection.ts`) — never in request paths. No dead code blocks.          |
| A8  | TODO/FIXME tracked, not accumulating in critical paths            | Nice     | **PASS** | Grep for `TODO/FIXME/XXX/HACK` in app source: **none**.                                                                                                                                        |

## Section B — Maintainability

| #   | Item                                                                                        | Severity | Result   | Basis                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Actual structure matches `ARCHITECTURE.md`/`CLAUDE.md`                                      | Minor    | **FAIL** | See **Arch-B-1**. `CLAUDE.md` documents a flat single `src/` tree; reality is an npm-workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`). Also Node-version drift (docs say 18, `engines` says ≥20.19).                                                                                                                                                       |
| B2  | Module boundaries hold (logic in services, data access isolated from HTTP)                  | Minor    | **PASS** | Routes are thin (parse → call service → `sendOk`); all DB access lives in `services/*` via injected RLS client; no SQL or business rules in handlers.                                                                                                                                                                                                                     |
| B3  | No "god files"                                                                              | Nice     | **PASS** | Largest unit is `015_rls_policies.sql` (466 lines) — appropriately one cohesive concern. All TS files are small and single-purpose.                                                                                                                                                                                                                                       |
| B4  | Cross-cutting logic has a single source of truth                                            | Minor    | **PASS** | Validation (`utils/validate.ts`), envelope (`utils/http.ts`), auth (`middleware/auth.ts`), DB-error mapping (`utils/db.ts`), paging (`utils/paging.ts`) each centralized; no per-route copy-paste.                                                                                                                                                                        |
| B5  | Naming/folder conventions consistent FE+BE                                                  | Nice     | **PASS** | Consistent kebab/camel file naming, `api`/`services`/`middleware`/`utils`/`lib` on the back end, `pages`/`components`/`hooks`/`lib` on the front.                                                                                                                                                                                                                         |
| B6  | DB changes as ordered migrations; reproducible rebuild; reversible or forward-only explicit | Critical | **PASS** | `migrate.ts` applies `NNN_*.sql` in numeric order, each in its own transaction, tracked in `schema_migrations`, idempotent. `SCHEMA.sql` is a generated concatenation and its table set matches the migrations exactly. _(Minor caveat: forward-only by design but the policy isn't stated in writing, and there are no down-migrations — acceptable, noted not failed.)_ |
| B7  | Living docs reflect current code                                                            | Minor    | **FAIL** | See **Arch-B-7**. `API_CONTRACT.md` is current and `SCHEMA.sql` is in sync, but `COMPONENT_SPECS.md` is badly stale (still "In Design," obsolete `JobBrowser`/`Chat`/`JobCard{budget,timeline}` tree, placeholder `[Date]`).                                                                                                                                              |

## Section C — Shared-type consistency (`packages/shared` ↔ API)

> **The known-debt section. Audited endpoint by endpoint against
> `API_CONTRACT.md`.** Every implemented endpoint group was checked; the result
> is uniform, so the per-endpoint detail lives in finding **Arch-C-1**.

| #   | Item                                                                                                         | Severity | Result   | Basis                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------ | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Every shared type matches the actual endpoint (field names, optionality, types, enums), endpoint by endpoint | Critical | **FAIL** | See **Arch-C-1**. Of the 6 implemented resource groups (auth/register, auth/me, profiles, workers, companies, logout), **zero** have a matching shared type. The shared package models an obsolete domain.                               |
| C2  | Frontend consumes shared types (not local copies that drift)                                                 | Minor    | **FAIL** | See **Arch-C-2**. FE _does_ import `User`/`ApiResponse`/`ErrorCode`/`UserRole`, but `User` is the wrong shape — "consuming" it is what _realized_ the drift as a runtime bug; `Register.tsx` also hand-rolls `RegisterPayload` locally.  |
| C3  | Backend runtime (zod) schemas agree with shared static types                                                 | Minor    | **FAIL** | See **Arch-C-3**. Backend ignores `packages/shared` entirely (zod + local `types/db.ts`); `utils/http.ts` even comments that the shared `ErrorCode` "still needs reconciliation." No derivation either direction.                        |
| C4  | Representation conventions consistent across the boundary (dates/money/ids/null vs optional)                 | Minor    | **FAIL** | See **Arch-C-4**. Case convention itself differs (API `snake_case` vs shared `camelCase`); shared `User` has no nullable fields though `ProfileRow` is mostly nullable; shared `User` omits `email` though the API returns it.           |
| C5  | Enums have a single shared definition used by DB/API/FE                                                      | Minor    | **FAIL** | See **Arch-C-5**. `role` is defined 4× (DB CHECK, zod, `types/db.ts`, shared); `availability`/`english_level`/`size` exist in zod+db only, absent from shared; shared `ApplicationStatus`/`OfferStatus` _contradict_ the DB CHECK lists. |
| C6  | API error `code` values map to a shared enumerated set                                                       | Minor    | **FAIL** | See **Arch-C-6**. Shared `ErrorCode` is missing `NOT_FOUND` and `CONFLICT`, still carries obsolete `PROJECT_NOT_FOUND`; the real set lives in backend `ApiCode`, un-shared.                                                              |
| C7  | A pattern exists (codegen / schema-first / single source) to keep types in sync as Phase 1 types are added   | Minor    | **FAIL** | See **Arch-C-7**. None. Three hand-maintained type sources already drifted in Phase 0; nothing prevents the same across listings/applications/messaging. This is the _strategic_ risk under all of Section C.                            |

## Section D — Presentation / logic separation (frontend)

> Goal: a future visual redesign should be possible without rewriting business logic.

| #   | Item                                                                       | Severity | Result   | Basis                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Data fetching / business logic in hooks/services, not inline in components | Minor    | **PASS** | Auth/session in `useAuth`, profile lifecycle in `useProfile`, all HTTP in `lib/api.ts`. Components read hooks. _(Register submits via `api.post` inline — a thin form action, acceptable.)_ |
| D2  | Presentational components are props-in→UI-out; stateful logic isolated     | Minor    | **PASS** | `Dashboard`/`Layout` derive entirely from `useProfile`/`useAuth`; `PlaceholderCard`/`RoleOption`/`Spinner` are pure.                                                                        |
| D3  | Styling decoupled from logic                                               | Minor    | **PASS** | Tailwind utility classes in markup; no behavior entangled with styling — restyling won't touch logic.                                                                                       |
| D4  | API calls go through one client/data layer                                 | Minor    | **PASS** | Single typed `api` module (`get/post/put/patch/delete`) wraps `fetch`, token attach, envelope unwrap, and `ApiError`. No scattered `fetch` in components.                                   |
| D5  | Routing/global state/side effects separated from pure rendering            | Nice     | **PASS** | Routing in `App.tsx`; global state via `AuthProvider`/`ProfileProvider`; effects confined to hooks.                                                                                         |
| D6  | Spot-check 2–3 core flows: could the visual layer be swapped wholesale?    | Minor    | **PASS** | Login + view-profile flows: all logic in hooks/`api`, so yes. _(Edit-profile UI isn't built yet — only the `PATCH` endpoint exists — but the pattern holds.)_                               |
| D7  | Frontend uses shared types end-to-end for compile-time safety              | Nice     | **FAIL** | See **Arch-D-7**. It _imports_ shared types, but they're wrong, so the compile-time safety is illusory — green build, wrong at runtime. Symptom of Section C.                               |

## Section E — Phase 1 readiness (cross-cutting)

| #   | Item                                                                                        | Severity             | Result   | Basis                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Schema normalized so listings/applications/messaging add without restructuring Phase 0      | Critical             | **PASS** | Those tables **already exist** (migrations 006/007/010), fully normalized and FK'd into `profiles`/`worker_profiles`/`company_profiles`. No Phase 0 table needs restructuring.                                                                                                                                                                      |
| E2  | Applications (workers↔listings, many-to-many, multi-party visibility) fit data + auth model | Critical             | **PASS** | `applications` with `UNIQUE(listing_id, worker_profile_id)`; RLS `applications_select` = worker **OR** hiring-company-manager **OR** admin (genuine multi-party); insert restricted to the owning worker. Pattern generalizes.                                                                                                                      |
| E3  | Messaging has a viable path (real-time scaffolding? socket auth? where data lives?)         | Critical → **Minor** | **FAIL** | See **Arch-E-3**. Data layer is excellent and ready; but **no Socket.io dependency exists**, no real-time scaffolding, and **no socket-auth design**. Net-new work, not a Phase 0 flaw → severity lowered to Minor.                                                                                                                                 |
| E4  | List-heavy features have a workable pagination/filtering pattern                            | Minor                | **PASS** | `parsePaging` caps `limit` at 100 with safe defaults; lists ordered by `created_at`; browse indexes in place. _(Note: it's offset pagination, while `ARCHITECTURE.md §5` claims "cursor pagination on all lists" — doc drift, offset is fine for Phase 1 volume.)_                                                                                  |
| E5  | Translation abstracted behind a service so messaging can reuse it                           | Nice                 | **FAIL** | See **Arch-E-5**. No translation code exists yet (no Google Translate client/service). The `message_translations` cache table is ready, but there is no abstraction to confirm. Expected unbuilt Phase 1 work.                                                                                                                                      |
| E6  | No obvious perf traps (missing FK indexes, N+1)                                             | Minor                | **PASS** | FK/filter columns indexed across `listings`, `applications`, `offers`, `engagements`, `messages`, `conversation_participants`; partial index on open listings; trigram GIN for search. _(Minor: `offers.application_id/listing_id`, `conversations.listing_id/engagement_id` lack their own index — low-volume, fine.)_ No N+1 in current services. |
| E7  | Overall judgment (one-paragraph verdict)                                                    | Critical             | **PASS** | Provided — see **Verdict** above and the closing paragraph below.                                                                                                                                                                                                                                                                                   |

---

# Appendix — Findings (one per FAIL)

### Arch-A-5 — Test coverage is not measured; frontend is untested

```
ID:             Arch-A-5
Checklist:      Architecture (A — code health)
Location:       apps/api/package.json (test: "vitest run"), apps/web/package.json (no test script),
                .github/workflows/ci.yml
Observed:       No coverage tooling anywhere — no @vitest/coverage-* dependency, no coverage
                threshold, vitest invoked without --coverage. The backend suite is solid (23/23
                mocked tests pass and assert status codes, error codes and body shapes; a live
                rls.test.ts also exists). But the frontend has ZERO tests, and CI runs
                lint+typecheck+test only (no coverage gate, no build step).
Why it matters: ARCHITECTURE Principle #2 states ">80% coverage". That bar is currently
                unmeasured and almost certainly unmet (the entire web app is uncovered).
                Without measurement the team can't see coverage regress as Phase 1 lands.
Severity:       Minor (unchanged) — tests that exist are good; this is a gap, not a defect.
Phase 1 impact: no (does not block starting Phase 1; add a coverage gate alongside it)
```

### Arch-B-1 — Project-structure docs don't match the monorepo

```
ID:             Arch-B-1
Checklist:      Architecture (B — maintainability)
Location:       CLAUDE.md "Project Structure" section; ARCHITECTURE.md §3 (Node 18) vs
                package.json engines (node >=20.19) / CI (Node 20)
Observed:       CLAUDE.md documents a single flat src/ tree (/api,/services,/models,/components,
                /pages,/hooks,/lib,/db,/types). The real repo is an npm-workspaces monorepo:
                apps/api, apps/web, packages/shared. Separately, ARCHITECTURE.md and its tech
                table say "Node 18" while engines and CI pin Node 20.
Why it matters: The structure doc is the first map a new contributor reads; a wrong map costs
                every future contributor time. The Node mismatch can mislead local setup.
Severity:       Minor (unchanged)
Phase 1 impact: no
```

### Arch-B-7 — COMPONENT_SPECS.md is stale (obsolete domain)

```
ID:             Arch-B-7
Checklist:      Architecture (B — maintainability / living docs)
Location:       COMPONENT_SPECS.md
Observed:       Still labelled "In Design by @frontend", "Last update: [Date]". Shows a component
                tree (Home, JobBrowser, MyApplications, Chat) and a JobCard with
                props {id,title,description,budget,timeline} — i.e. the pre-ADR-002 separate
                projects/jobs model. The actual app is Login/Register/Dashboard/NotFound +
                Layout/ProtectedRoute/Spinner. API_CONTRACT.md and SCHEMA.sql, by contrast,
                ARE current.
Why it matters: A "living document" describing a domain the team explicitly abandoned (ADR-002/003
                unified listings) actively misleads Phase 1 component work and reinforces the same
                obsolete vocabulary that has rotted packages/shared (Arch-C-1).
Severity:       Minor (unchanged)
Phase 1 impact: no (but update before frontend Phase 1 work keys off it)
```

### Arch-C-1 — `packages/shared` does not model any implemented endpoint (CRITICAL)

```
ID:             Arch-C-1
Checklist:      Architecture (C — shared types)
Location:       packages/shared/src/types/index.ts  vs  API_CONTRACT.md + apps/api/src/api/*,
                apps/api/src/types/db.ts
Observed:       Endpoint-by-endpoint against API_CONTRACT.md, NONE of the implemented endpoints
                has a correct shared type:

                • POST /api/auth/register → returns ProfileRow & {email} (snake_case: full_name,
                  display_name, preferred_language, is_active, created_at…). Shared has NO Profile
                  type. The FE types the response as shared `User` (camelCase fullName/createdAt,
                  no email) — wrong shape.
                • GET  /api/auth/me → same ProfileRow & {email}; FE again types it as `User`.
                  This is the live bug: Dashboard.tsx:11 and Layout.tsx:27 read profile.fullName
                  from a payload that carries full_name → name renders as "there"/email fallback.
                • GET/PATCH /api/profiles/me → ProfileRow. No shared Profile type.
                • GET /api/workers[/:id|/me], PUT /api/workers/me → WorkerProfileRow
                  (headline, hourly_rate_usd, english_level, is_verified…). No shared WorkerProfile
                  type at all.
                • GET/POST/GET/PATCH /api/companies → CompanyProfileRow (owner_profile_id, slug,
                  headquarters_country…). No shared Company type at all.
                • POST /api/auth/logout → {signed_out:boolean}. No shared type.

                What packages/shared DOES contain is an obsolete pre-ADR-002 domain: Project
                (budget/timeline/employerId), Job (salary), Application (projectId/workerId),
                Offer (jobId), Employment, Message (assignmentId) — entities the unified `listings`
                model (ADR-002/003) replaced and the API never exposed.

                Confirmed it compiles: `npm run typecheck` exits 0. TypeScript cannot catch the
                mismatch because `User.fullName` is a valid optional field — it's simply never
                populated at runtime.
Why it matters: The package whose entire job is one source of truth across FE/BE is ~100% drifted
                from both the API and the schema, and it already produces a user-visible defect
                that the type system masks. Building Phase 1 (listing/application/message types)
                on top of this will inherit the same camelCase/obsolete-domain rot.
Severity:       Critical (unchanged). Foundation flaw that forces rework if built upon — but the
                fix is small and mechanical (see below), so it gates Phase 1 rather than blocking
                it outright.
Phase 1 impact: yes — fix before Phase 1. Suggested fix: regenerate packages/shared from the
                real row shapes (mirror apps/api/src/types/db.ts, snake_case, nullable fields,
                include email on the "me" payload), delete the Project/Job/Offer/Employment types,
                and have the FE consume them. This is hours, not days.
```

### Arch-C-2 — Frontend consumes shared types, but the consumed type is wrong

```
ID:             Arch-C-2
Checklist:      Architecture (C — shared types)
Location:       apps/web/src/hooks/useProfile.tsx:3,39 (User); apps/web/src/pages/Register.tsx:4,27
                (User, UserRole, local RegisterPayload); apps/web/src/lib/api.ts:1 (ApiResponse,
                ErrorCode)
Observed:       The FE does import from @chinatalent/shared rather than redefining everything —
                but the one response type it relies on (User) is the wrong shape, so the import
                realizes the drift instead of preventing it. Register.tsx additionally defines its
                own RegisterPayload locally (correctly snake_case), bypassing shared for the request.
Why it matters: "Consumes shared types" is only a virtue if the shared types are right. Here the
                mechanism that should prevent drift is the exact path that delivers the bug.
Severity:       Minor (unchanged) — resolves naturally once Arch-C-1 is fixed.
Phase 1 impact: no (folded into the Arch-C-1 fix)
```

### Arch-C-3 — Backend runtime schemas and shared static types are unrelated

```
ID:             Arch-C-3
Checklist:      Architecture (C — shared types)
Location:       apps/api/src/api/*.ts (zod schemas) + apps/api/src/types/db.ts  vs  packages/shared;
                apps/api/src/utils/http.ts:8-21 (explicit comment)
Observed:       The backend validates with zod and types rows with a local types/db.ts; it imports
                nothing domain-related from packages/shared. utils/http.ts openly documents this:
                the API "owns its own string codes here rather than coupling to that type today"
                because the shared ErrorCode "still needs reconciliation." So the runtime contract
                (zod) and the static shared contract are maintained independently and disagree.
Why it matters: Nothing derives one from the other, so they drift silently. The honest in-code
                acknowledgement is good, but the debt is real.
Severity:       Minor (unchanged)
Phase 1 impact: no (address via the Arch-C-7 sync pattern)
```

### Arch-C-4 — Representation conventions differ across the boundary

```
ID:             Arch-C-4
Checklist:      Architecture (C — shared types)
Location:       packages/shared/src/types/index.ts  vs  apps/api/src/types/db.ts + API_CONTRACT.md
Observed:       Case: API/DB are snake_case (API_CONTRACT explicitly: "Request and response bodies
                are snake_case"); shared is camelCase. Nullability: shared User has all-required
                fields; ProfileRow makes display_name/full_name/avatar_url/country/etc. nullable.
                Completeness: shared User omits email, which the auth endpoints DO return. (Money
                as number and ISO-string timestamps happen to agree.)
Why it matters: Beyond names, the optional/nullable and presence conventions disagree, so even a
                renamed-to-snake_case copy would still misrepresent which fields can be null/absent.
Severity:       Minor (unchanged)
Phase 1 impact: no (folded into Arch-C-1)
```

### Arch-C-5 — Enums are not single-sourced; some shared enums contradict the DB

```
ID:             Arch-C-5
Checklist:      Architecture (C — shared types)
Location:       DB CHECK constraints (migrations 002/004/005/007/008), zod enums (api/*.ts),
                apps/api/src/types/db.ts, packages/shared/src/types/index.ts
Observed:       `role` is defined four times (profiles CHECK, register zod enum, db.ts UserRole,
                shared UserRole). availability / english_level / chinese_level / company size live
                in zod + db.ts only — absent from shared. And shared enums that DO exist contradict
                the schema: shared ApplicationStatus = pending|accepted|rejected, but DB
                applications.status = submitted|reviewing|shortlisted|rejected|withdrawn|offered|
                hired; shared OfferStatus = pending|accepted|declined, but DB offers.status =
                draft|sent|accepted|declined|rescinded|expired.
Why it matters: No single definition means the FE can't trust an enum it switches on, and the
                contradictory ones would cause incorrect UI logic the moment those endpoints ship.
Severity:       Minor (unchanged)
Phase 1 impact: no (but reconcile when applications/offers endpoints are built)
```

### Arch-C-6 — Shared ErrorCode disagrees with the real error-code set

```
ID:             Arch-C-6
Checklist:      Architecture (C — shared types)
Location:       packages/shared/src/types/index.ts:17-23  vs  apps/api/src/utils/http.ts:14-21 +
                API_CONTRACT.md "Error Codes"
Observed:       Real set (backend ApiCode / contract): INVALID_TOKEN, UNAUTHORIZED, INVALID_INPUT,
                NOT_FOUND, USER_NOT_FOUND, CONFLICT, SERVER_ERROR. Shared ErrorCode: USER_NOT_FOUND,
                INVALID_TOKEN, INVALID_INPUT, PROJECT_NOT_FOUND, UNAUTHORIZED, SERVER_ERROR —
                i.e. missing NOT_FOUND and CONFLICT, and carrying obsolete PROJECT_NOT_FOUND.
                (USER_NOT_FOUND happens to be present, which is the only code the FE currently
                switches on — useProfile.tsx:42 — so nothing breaks today.)
Why it matters: A FE switch on err.code can't handle NOT_FOUND/CONFLICT type-safely, and references
                a code (PROJECT_NOT_FOUND) the backend never emits. Latent, not yet firing.
Severity:       Minor (unchanged)
Phase 1 impact: no
```

### Arch-C-7 — No mechanism keeps types in sync (the strategic risk)

```
ID:             Arch-C-7
Checklist:      Architecture (C — shared types, Phase 1 lens)
Location:       repo-wide (packages/shared has no codegen; backend has no schema-first source)
Observed:       Three hand-maintained type definitions (zod schemas, types/db.ts, packages/shared)
                with no generator, no schema-first single source, and no derivation between them.
                They have ALREADY diverged in Phase 0 (Arch-C-1..C-6). There is no pattern that
                would stop the same divergence as listings/applications/messaging types are added.
Why it matters: This is the root cause behind the whole C section. Without a sync mechanism the
                drift compounds with every new endpoint in Phase 1.
Severity:       Minor (tag unchanged) — but flagged as the highest-leverage fix in Section C.
Phase 1 impact: unsure-leaning-yes — not a hard blocker, but choosing a pattern now (e.g. derive
                shared types + a runtime validator from one source, or generate types from the DB)
                is far cheaper before Phase 1 multiplies the surface.
```

### Arch-D-7 — Frontend's compile-time type safety is illusory

```
ID:             Arch-D-7
Checklist:      Architecture (D — presentation/logic separation)
Location:       apps/web/src/hooks/useProfile.tsx, Dashboard.tsx:11, Layout.tsx:27
Observed:       The FE is wired end-to-end through shared types, which SHOULD give a redesign
                compile-time safety. But because the shared types are wrong (Arch-C-1), the build
                is green while the data is wrong — the fullName/full_name bug is the proof. A
                redesign would "keep" type safety that isn't actually protecting anything.
Why it matters: Undermines the stated goal of D (swap the visual layer safely): the safety net has
                holes the compiler reports as intact.
Severity:       Nice-to-have (unchanged) — purely a consequence of Arch-C-1; fixed when C-1 is.
Phase 1 impact: no
```

### Arch-E-3 — Messaging real-time layer is unbuilt and socket-auth undesigned

```
ID:             Arch-E-3
Checklist:      Architecture (E — Phase 1 readiness)
Location:       apps/api/package.json (no socket.io dependency); no realtime module anywhere;
                migration 010_messaging.sql + RLS in 015 (the parts that DO exist)
Observed:       Data path is genuinely ready: conversations / conversation_participants / messages /
                message_translations, with RLS gating reads/writes through is_conversation_participant()
                — multi-party and correct. BUT: Socket.io is in the stack on paper only — it is not
                a dependency, there is no server, no room/auth scaffolding, and no design for how a
                socket authenticates (the JWT-per-request model used by REST doesn't map 1:1 to a
                long-lived socket). ARCHITECTURE §7 itself flags single-node + Redis-adapter as
                later concerns, but the auth design is the Phase-1-relevant gap.
Why it matters: Messaging is explicitly in Phase 1. The persistence + authz foundation is solid,
                but the real-time delivery + socket-auth design is greenfield and should be settled
                before the messaging slice starts.
Severity:       Critical (suggested) → LOWERED to Minor. Justification: this is net-new work, not a
                Phase 0 defect, and it forces no rework of anything already built; the DB/RLS
                foundation messaging needs is present and correct.
Phase 1 impact: yes for the messaging slice specifically (design socket auth first); no for
                starting Phase 1 (listings/applications can proceed in parallel).
```

### Arch-E-5 — No translation service/abstraction exists yet

```
ID:             Arch-E-5
Checklist:      Architecture (E — Phase 1 readiness)
Location:       apps/api/src (no translate client/service); migration 010 (message_translations
                cache table — the part that exists)
Observed:       The message_translations table (one row per (message,target_language), provider
                column, unique constraint) is ready to back ADR-008's on-demand+cache strategy.
                But there is no Google Translate client and no translation service module, so there
                is no abstraction to confirm reuse against.
Why it matters: Low — translation is forward Phase 1 work and the schema groundwork is sound. Noted
                only because the item asserts an abstraction that doesn't exist yet.
Severity:       Nice-to-have (unchanged)
Phase 1 impact: no
```

---

## Closing note

The independent read corroborates the team's own `INSTANCES_STATUS.md`
"PENDIENTES TÉCNICOS" list (reconcile `packages/shared`; fix the `ErrorCode`
union) and adds two things that list doesn't name explicitly: the **absence of a
type-sync mechanism** (Arch-C-7 — the reason the drift will keep happening) and
the **undesigned Socket.io auth** for messaging (Arch-E-3). The schema, RLS, and
service/route architecture are strong enough to build Phase 1 on **today**, the
moment `packages/shared` is brought back into truth.

— _External architecture auditor. Read-only. No code modified._
