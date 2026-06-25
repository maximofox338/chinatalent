# Phase 0 Audit Checklists — China Talent Bridge

**Stage 1 deliverable (design only).** This document defines _what to check_. By design it records **no findings** and pre-identifies **no known issues** — each checklist is meant to be run by someone who did **not** build the code, so the checks are _categorical_ ("verify X holds for every Y"), not a list of suspected bugs. Giving auditors the answers would defeat the point of using fresh eyes.

**Three independent runs:**

| Checklist       | Run by                             | Access                   |
| --------------- | ---------------------------------- | ------------------------ |
| 1. Security     | Fresh auditor (did not build this) | Read-only repo           |
| 2. Architecture | Fresh auditor (did not build this) | Read-only repo           |
| 3. Functional   | Project owner, by hand             | Running app in a browser |

**The question behind every section:** _Is it safe to build Phase 1 (job listings, applications, messaging) on top of this foundation as it stands today?_

**Reference artifacts (in the repo):** `ARCHITECTURE.md`, `SCHEMA.sql`, `API_CONTRACT.md`, `packages/shared`, `tsconfig.json`(s). **Stack:** Node 18 + Express + TypeScript (backend) · React 18 + TypeScript + Tailwind (frontend) · PostgreSQL via Supabase (managed) · Supabase Auth, magic links · Socket.io · Google Cloud Translate.

---

## How to record results

Mark every item with exactly one of:

- **PASS** — the assertion holds.
- **FAIL** — the assertion does not hold. Record where (file + line / route / page) and one line on what you observed.
- **N/A** — the item genuinely does not apply. Say why in one line.

Do **not** leave items blank. "I couldn't determine this" is a **FAIL** with a note — an audit that can't verify a control carries the same risk as a missing control.

**Severity** is pre-tagged on each item as a _starting suggestion_ for triage. The auditor may raise or lower it based on what they find, and should say so.

| Tag                | Meaning                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **[Critical]**     | Exploitable security hole, data leak/loss, or a foundation flaw that forces rework once Phase 1 is built on it. Blocks Phase 1. |
| **[Minor]**        | A real problem that should be fixed but does not block starting Phase 1.                                                        |
| **[Nice-to-have]** | Hardening or polish; safe to defer.                                                                                             |

For every FAIL, use the report template in the Appendix so findings can be prioritized consistently.

---

# Checklist 1 — Security Audit

**For the auditor (orientation).** You did not build this system; that is the point. Build a map before checking anything — read, in order: `ARCHITECTURE.md`, `SCHEMA.sql`, `API_CONTRACT.md`, `packages/shared`, the `tsconfig`(s), then the Express route directory. Key fact about this stack: **Supabase exposes the database directly to clients** via an `anon` (public) key and an `authenticated` role, so **Row-Level Security is a primary access-control boundary, not an optional extra** — give Section C real weight. Where to look generally: DB/RLS → `SCHEMA.sql`, migrations, and (with a read-only client) `pg_policies` / `information_schema`; validation & authz → route handlers, middleware, services; secrets → `.env*`, CI config, the built client bundle; XSS → React components that render user content.

### A. SQL injection

- [ ] Every database query that includes request-derived data passes that data as **bound parameters / query-builder arguments**, never string-concatenated or template-interpolated into SQL. **[Critical]**
- [ ] A repo-wide search for raw SQL execution (`pool.query(`…${ }…`)`, `client.query` with concatenation, `knex.raw`, `sequelize.query`, `.rpc()` building SQL strings, Supabase `execute_sql`/`.sql` helpers) finds **no** case where user input is concatenated. **[Critical]**
- [ ] Identifiers that cannot be parameterized (table/column names, `ORDER BY` sort field, sort direction) are validated against a fixed **allow-list**, not taken raw from the request. **[Critical]**
- [ ] `LIKE`/`ILIKE` search endpoints escape user-supplied `%` and `_` (or bind them) so wildcards can't be injected. **[Minor]**
- [ ] Any Postgres functions / RPCs that build **dynamic SQL** use `format()` with `%I`/`%L` or `USING`, never concatenation. **[Critical]**
- [ ] No query is assembled from the keys/values of the raw request body (dynamic query building from untrusted shapes). **[Critical]**

### B. Cross-site scripting (XSS)

- [ ] Every `dangerouslySetInnerHTML` (and any `innerHTML` / `insertAdjacentHTML` / `document.write` outside React) renders only content that is sanitized (e.g. DOMPurify) or provably non-user-controlled. **[Critical]**
- [ ] All user-generated content shown to **other** users (profile name, bio, headline, directory fields, later messages) renders as text via normal React escaping, never as HTML. **[Critical]**
- [ ] Any Markdown / rich-text rendering disables raw HTML or sanitizes output. **[Critical]** _(N/A if none.)_
- [ ] User-controlled values used in `href` / `src` / `window.location` are validated to block `javascript:` / `data:` URIs. **[Minor]**
- [ ] Translation output (Google Translate) is rendered as text, not injected as HTML. **[Minor]**
- [ ] A Content-Security-Policy header is set in production (avoid `unsafe-inline` / `unsafe-eval` for scripts where possible). **[Nice-to-have]**
- [ ] Server-generated error / redirect pages do not reflect raw request input into the response body. **[Minor]**

### C. Row-Level Security (RLS) coverage

- [ ] **Every** table storing user-owned or company/tenant-owned data has RLS **enabled** (`ENABLE ROW LEVEL SECURITY`). Enumerate all tables from `SCHEMA.sql`/migrations and check each — none missed. **[Critical]**
- [ ] Every RLS-enabled table has at least one policy, and its posture (who reads/writes which rows) is explicit and matches `ARCHITECTURE.md`. A table with RLS enabled but **no** policy (deny-all) is intentional, not something quietly worked around elsewhere. **[Critical]**
- [ ] **INSERT** policies use `WITH CHECK` (not only `USING`), so a user cannot insert a row owned by someone else (e.g. set `user_id` to another user). **[Critical]**
- [ ] Correct, separate policies exist for **SELECT / INSERT / UPDATE / DELETE** as the data model requires — no operation left silently wide open and none missing where it should be restricted. **[Critical]**
- [ ] No policy uses `USING (true)` / `WITH CHECK (true)` (or equivalent) on a table holding private data. Any such case is explicitly justified. **[Critical]**
- [ ] Row-ownership predicates tie rows to the authenticated user (`auth.uid() = user_id` or equivalent), and the keyed column cannot be set by the client to forge ownership. **[Critical]**
- [ ] Identify every path that uses the Supabase **`service_role`** key (which **bypasses RLS**). For each, authorization is enforced in application code, and the key is never shipped to the client. **[Critical]**
- [ ] `SECURITY DEFINER` functions and views over protected tables do not leak rows past the RLS that would otherwise apply. **[Critical]**
- [ ] The `anon` vs `authenticated` distinction is correct: anonymous users cannot read/write anything they shouldn't. **[Critical]**
- [ ] **Phase 1 lens:** the RLS model can express **multi-party** row visibility (an application/message visible to _both_ a worker and a company). Confirm the pattern supports this, or flag that Phase 1 tables will need a different approach. **[Critical]**

### D. Input validation at route boundaries

- [ ] Every Express route validates `body`, `query`, and `params` against an explicit schema (zod/joi/yup/express-validator) **before** the data is used. No route trusts raw input. **[Critical]**
- [ ] Validation enforces types, required fields, **string length limits**, enum membership, `email`/`UUID` formats, and numeric ranges. **[Minor]**
- [ ] Unknown/extra fields are **stripped or rejected** (mass-assignment protection): clients cannot set privileged fields (`role`, `is_admin`, `user_id`, ownership, status) by smuggling them into a body. **[Critical]**
- [ ] List endpoints bound pagination (`limit`/`offset`/page size) to sane maximums. **[Minor]**
- [ ] File uploads (if any) validate content-type and size server-side. **[Minor]** _(N/A if no uploads.)_
- [ ] Validation failures return the standard `{ success:false, error, code }` shape with **no** stack trace / internal detail leaked. **[Minor]**
- [ ] ID parameters are validated to the expected format before any lookup. **[Minor]**

### E. Secret leakage

- [ ] `.env` / `.env.*` are gitignored and **not** committed; a scan of git history shows no committed credentials. **[Critical]**
- [ ] No secrets are hardcoded in source: DB connection strings, JWT secrets, the Supabase `service_role` key, Google Cloud credentials, Sentry write tokens, third-party API keys. **[Critical]**
- [ ] The built **client bundle** contains only public values — the Supabase **anon** key and public URL — and **no** `service_role` key or server-only secret. Grep the built assets to confirm. **[Critical]**
- [ ] Client-exposed env vars use the framework's public prefix (`VITE_` / `NEXT_PUBLIC_`), and **only** non-sensitive values carry that prefix. **[Critical]**
- [ ] Logs and error reporting (Sentry, console) do not capture tokens, magic-link tokens, passwords, full auth headers, or PII. **[Minor]**
- [ ] Error responses to clients never echo secrets, connection details, or internal stack traces in production. **[Minor]**
- [ ] Production source maps are either not publicly served or confirmed free of secrets. **[Nice-to-have]**

### F. Privilege escalation & access control

- [ ] **Horizontal:** for every endpoint taking a resource ID, swapping it for another user's resource is rejected — ownership is enforced (via RLS _or_ an explicit server-side `where owner = auth.uid()`), not assumed. **[Critical]**
- [ ] **Vertical:** role-gated actions (employer-only: post a job, view applicants; any admin action) are blocked for users without that role. **[Critical]**
- [ ] The acting user's identity and role come from the **verified JWT server-side**, never from a client-supplied field/header/body value. **[Critical]**
- [ ] Profile/resource **edit & delete** endpoints verify the caller owns the target (no IDOR via a different ID). **[Critical]**
- [ ] Company/tenant-internal data is not readable by workers (and vice-versa) where it shouldn't be. **[Critical]**
- [ ] The `authenticated` role cannot invoke privileged RPCs/functions it shouldn't. **[Critical]**
- [ ] Deactivating/deleting an account revokes its access (its tokens stop working as expected). **[Minor]**
- [ ] **Phase 1 lens:** the authorization pattern generalizes to multi-party resources (applications, threads) without fragile per-endpoint bespoke checks. **[Critical]**

### G. Authentication & session (magic-link specifics)

- [ ] Magic-link tokens are single-use and time-limited (confirm Supabase config, not just defaults). **[Critical]**
- [ ] The magic-link token is not logged and can't leak (e.g. via `Referer` from a third-party resource on the landing page). **[Minor]**
- [ ] Every protected route **verifies** the JWT (signature, expiry, audience) — none relies on the mere presence of a token. **[Critical]**
- [ ] Supabase `redirectTo` / allowed redirect URLs are allow-listed to prevent open redirect via the auth flow. **[Critical]**
- [ ] The client session/refresh-token storage choice is deliberate and its XSS exposure understood (tokens in `localStorage` are readable by any XSS). **[Minor]**
- [ ] Auth endpoints (magic-link request) are rate-limited against email-bombing / brute force. **[Minor]**
- [ ] The app does not reveal whether an email is registered (no user enumeration via differing responses/timing). **[Minor]**
- [ ] **CORS** allows only the known frontend origin(s) — not `*` with credentials. **[Critical]**
- [ ] If auth uses cookies, CSRF protection exists; if Bearer tokens, confirm they aren't auto-attached cross-site. **[Minor]**

### H. Security — Phase 1 readiness (cross-cutting)

- [ ] Authenticating **Socket.io** connections is accounted for (messaging needs authenticated sockets + per-room authorization), or explicitly flagged as not-yet-built. **[Critical]**
- [ ] Auth/RLS/validation patterns are documented well enough that whoever builds Phase 1 applies them consistently rather than reinventing per feature. **[Minor]**
- [ ] No Phase 0 shortcut (a broad policy, a `service_role` path, a check disabled "for now") will silently widen access once Phase 1 data shares the same tables/roles. **[Critical]**

---

# Checklist 2 — Architecture Audit

**For the auditor (orientation).** Same starting reading as Checklist 1. You're judging whether this foundation is healthy and whether Phase 1 (listings, applications, messaging) can sit on it without rework. Note up front: the planning files are described as "living documents" — part of your job is to verify they still match the code, since doc-vs-reality drift is itself a maintainability risk.

### A. Technical debt & code health

- [ ] TypeScript **strict mode** is on in every `tsconfig` (`"strict": true`), not just claimed. **[Minor]**
- [ ] Escape hatches are rare and justified: count `any`, `as any`, `@ts-ignore`, `@ts-nocheck`, and non-null `!` on untrusted values. A high count signals hidden type debt. **[Minor]**
- [ ] `build`, lint, and `tsc --noEmit` all pass cleanly (no errors; warnings triaged). **[Minor]**
- [ ] `npm audit` (or equivalent) shows no high/critical dependency vulnerabilities; lockfile committed; no obviously unused deps. **[Minor]**
- [ ] Test coverage is measured and meets the stated bar (>80%); spot-check that tests assert behavior, not just execute code. **[Minor]**
- [ ] Error handling is uniform: the `{ success, error, code }` contract is applied across routes; errors aren't swallowed or thrown raw to clients. **[Minor]**
- [ ] Dead code, large commented-out blocks, and stray debug logging are minimal. **[Nice-to-have]**
- [ ] TODO/FIXME markers are tracked, not silently accumulating in critical paths. **[Nice-to-have]**

### B. Maintainability

- [ ] The actual project structure matches `ARCHITECTURE.md`/`CLAUDE.md`. **Flag divergences** (e.g. a documented flat `src/` vs an actual monorepo with `packages/*`) — stale structure docs slow every future contributor. **[Minor]**
- [ ] Module boundaries hold: business logic lives in services, not inside route handlers; data access is isolated from HTTP concerns. **[Minor]**
- [ ] No "god files": no single file/function carries disproportionate responsibility or length. **[Nice-to-have]**
- [ ] Cross-cutting logic (validation, auth checks, error shaping, logging) has a **single source of truth**, not copy-pasted per route. **[Minor]**
- [ ] Naming and folder conventions are consistent across backend and frontend. **[Nice-to-have]**
- [ ] DB changes are managed as **ordered migrations**; the schema rebuilds from scratch reproducibly; migrations are reversible or a forward-only policy is explicit. **[Critical]**
- [ ] The living documents (`API_CONTRACT.md`, `SCHEMA.sql`, `COMPONENT_SPECS.md`) reflect the current code; gaps are noted. **[Minor]**

### C. Shared-type consistency (`packages/shared` ↔ API)

- [ ] Every type in `packages/shared` modeling an API request/response **matches the actual endpoint** — field names, optional vs required, value types, and enums all agree with what the handler accepts/returns. Go endpoint by endpoint against `API_CONTRACT.md`. **[Critical]**
- [ ] The **frontend consumes the shared types** rather than redefining local copies that drift. **[Minor]**
- [ ] The backend's **runtime** validation schemas agree with the shared **static** types (a field can't be `string` in the type but accept other shapes at runtime); ideally one is derived from the other. **[Minor]**
- [ ] Representation conventions are consistent across the boundary: dates (ISO string vs epoch vs `Date`), money/amounts, IDs, and null vs optional vs undefined. **[Minor]**
- [ ] Enumerations (status values, roles) have a single shared definition used by DB, API, and frontend — not three hand-maintained lists. **[Minor]**
- [ ] API error `code` values correspond to a shared, enumerated set the frontend can switch on safely. **[Minor]**
- [ ] **Phase 1 lens:** a pattern exists (codegen, schema-first, or a single shared source) to keep types and API in sync as listings/applications/messaging types are added — otherwise drift compounds. **[Minor]**

### D. Presentation / logic separation (frontend)

> Goal: a future **visual redesign** should be possible without rewriting business logic.

- [ ] Data fetching and business logic live in **hooks / services / a data layer**, not inline in presentational components. **[Minor]**
- [ ] Presentational components are largely "props in → UI out"; stateful/side-effecting logic is isolated (containers/hooks). **[Minor]**
- [ ] Styling (Tailwind classes / design tokens) is decoupled from logic, so restyling doesn't require touching behavior. **[Minor]**
- [ ] API calls go through a single client/data layer (typed API module or query hooks), not scattered `fetch` calls in components. **[Minor]**
- [ ] Routing, global state, and side effects are separated from pure rendering. **[Nice-to-have]**
- [ ] **Spot-check 2–3 core flows** (login, view profile, edit profile): could the entire visual layer be swapped for a new design system while keeping hooks/services intact? **[Minor]**
- [ ] The frontend uses the shared types end-to-end, so a redesign keeps compile-time safety. **[Nice-to-have]**

### E. Architecture — Phase 1 readiness (cross-cutting)

- [ ] The schema is normalized enough that **listings, applications, and messaging** can be added as new tables/relations without restructuring Phase 0 tables. **[Critical]**
- [ ] **Applications** (workers ↔ listings, many-to-many, multi-party visibility) fit the current data + auth model. **[Critical]**
- [ ] **Messaging** has a viable path: Socket.io is in the stack — confirm whether real-time scaffolding exists, how sockets will authenticate, and where message data will live. **[Critical]**
- [ ] List-heavy features have a workable **pagination/filtering** pattern already, or one that clearly extends. **[Minor]**
- [ ] Translation (Google Translate) is abstracted behind a service so messaging can reuse it. **[Nice-to-have]**
- [ ] No obvious performance traps for Phase 1 volume: missing indexes on foreign keys / common filters, N+1 patterns in services. **[Minor]**
- [ ] **Overall judgment:** record a one-paragraph verdict — _safe to build Phase 1, build-with-fixes, or foundation needs work first?_ **[Critical]**

---

# Checklist 3 — Functional Audit (manual, non-technical)

**Before you start.** Use the **staging** app in a normal browser (ask the team for the URL). Have a real email inbox you can read. If possible, get a **second** email/test account — a couple of checks need two accounts (mark those N/A if you only have one). Everything here is clickable; no developer tools required — just watch for anything broken, frozen, or wrong. For each step: do **What to do**, then compare against **Expected (PASS)**. If you see the **Fail signal** instead, mark FAIL and jot down what happened (a screenshot helps).

### A. Registration (new account)

- [ ] **Do:** Go to the site, find Sign up / Get started, enter a valid email, submit. **Expected (PASS):** A clear confirmation that a sign-in link was emailed; no error; no crash or hang. **[Critical]** · **Fail signal:** error, blank page, endless spinner, or no confirmation.
- [ ] **Do:** Try to sign up with an obviously invalid email (e.g. `abc`). **Expected (PASS):** Rejected with a clear message; nothing crashes. **[Minor]**
- [ ] **Do:** Submit with the email field empty. **Expected (PASS):** Blocked with a clear "email required" message. **[Minor]**

### B. Magic-link delivery

- [ ] **Do:** Open your inbox. **Expected (PASS):** The sign-in email arrives within ~2 minutes, from the expected sender, branding looks right, with a clear sign-in button/link. **[Critical]** · **Fail signal:** no email after several minutes, broken formatting, wrong sender, or a malformed link.

### C. Completing sign-in (clicking the link)

- [ ] **Do:** Click the sign-in link. **Expected (PASS):** You land **logged in** inside the app (dashboard or profile), not on an error page. **[Critical]**
- [ ] **Do:** Click the same link a **second** time (or click a link requested 1+ hour ago). **Expected (PASS):** A graceful "link expired / already used — request a new one" message — **not** a crash, blank page, or (worse) silently logging you in again. **[Minor]**

### D. Viewing your profile

- [ ] **Do:** After signing in, open your profile/account. **Expected (PASS):** Profile loads with clearly labeled fields; a brand-new account is prompted to complete it; nothing is broken or empty-where-it-shouldn't-be. **[Minor]**

### E. Editing your profile

- [ ] **Do:** Change a field (e.g. name or bio) and save. **Expected (PASS):** A success indicator appears and the new value sticks. **[Critical]**
- [ ] **Do:** **Reload the page** (or sign out and back in) and check the field. **Expected (PASS):** Your change is still there — it really saved. **[Critical]** · **Fail signal:** the field reverts to the old value.
- [ ] **Do:** Clear a required field and try to save. **Expected (PASS):** Blocked with a clear message; no crash. **[Minor]**

### F. Directory / browse

- [ ] **Do:** Open the directory / browse view. **Expected (PASS):** The list loads, entries look correct, and your own profile appears where expected. **[Minor]**
- [ ] **Do:** Look closely at what's shown for **other** people. **Expected (PASS):** You only see information meant to be public — **not** anyone's private details (e.g. their email, or anything marked private) unless that's intended. If unsure whether a field should be visible, flag it. **[Critical]**

### G. Staying signed in (session)

- [ ] **Do:** Refresh the page; then close the tab and reopen the app URL. **Expected (PASS):** You're still signed in (or whatever the intended behavior is) — not unexpectedly kicked out. **[Minor]**

### H. Signing out

- [ ] **Do:** Find and click Sign out / Log out. **Expected (PASS):** You're returned to a signed-out state. **[Critical]**
- [ ] **Do:** Immediately press the browser **Back** button, and try typing a logged-in page URL directly. **Expected (PASS):** You **cannot** get back in — you're sent to the login screen. **[Critical]** · **Fail signal:** you can still see logged-in pages or private data after signing out.

### I. Basic access control you can check by hand

- [ ] **Do (while signed out):** Paste a logged-in page URL (e.g. dashboard/profile) straight into the address bar. **Expected (PASS):** Redirected to login, **not** shown the page. **[Critical]**
- [ ] **Do (needs two accounts):** Sign in as account **A**, copy the URL of your profile / a resource. Sign out, sign in as account **B**, paste account A's URL. **Expected (PASS):** You cannot view or edit A's private data as B. **[Critical]** _(N/A if you only have one account — tell the team this couldn't be tested manually.)_

### J. General robustness

- [ ] **Do:** Click around the whole app. Use Back/Forward a lot. Double-click submit buttons. If your browser can throttle network speed, try "Slow 3G." **Expected (PASS):** No crashes, no permanently stuck spinners, no broken/blank pages; any errors are readable, not raw technical dumps. **[Minor]**

### K. Cross-cutting (your overall read)

- [ ] **Do:** Step back and write 2–3 sentences: did the core experience feel reliable enough to build more features on, or fragile? Note anything confusing, slow, or broken — even if it "worked." **[Minor]**

---

# Appendix — Finding report template

For every **FAIL** (and any item where you changed the suggested severity), record:

```
ID:             e.g. Security-C-3
Checklist:      Security / Architecture / Functional
Location:       file:line  OR  route  OR  page/URL  OR  screenshot ref
Observed:       what you actually saw / found
Why it matters: the risk or consequence
Severity:       Critical / Minor / Nice-to-have  (note if changed from suggested)
Phase 1 impact: does this block building Phase 1?  yes / no / unsure
```

**Summary to deliver back:** PASS / FAIL / N/A counts per checklist, the number of **Critical** findings, and a one-line answer to _"Is it safe to build Phase 1 on this?"_ — **yes / yes-with-fixes / not-yet**.
