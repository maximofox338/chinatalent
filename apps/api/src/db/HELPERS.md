# Database Helpers & RLS Contract — notes for @backend

Owner: @qa · Audience: @backend (services/middleware) · Status: Phase 0 complete, live on Supabase

This is the contract between the database's Row Level Security (RLS) layer and
the API services. **Read this before writing any query**, because how you
connect determines whether RLS protects your users or is silently bypassed.

The runnable source of truth is `migrations/001..015`. RLS lives in
`015_rls_policies.sql`. All 28 tables have RLS **enabled and FORCED**.

---

## 1. The mental model

Every table is **default-deny**. A role sees a row only if a policy explicitly
permits it. There are three Postgres roles in play:

| Role            | How you get it                                | RLS behavior                       |
| --------------- | --------------------------------------------- | ---------------------------------- |
| `anon`          | Supabase client with the anon key, no user    | Policies apply; only public reads  |
| `authenticated` | Supabase client with a logged-in user's JWT   | Policies apply; scoped to the user |
| `service_role`  | Supabase client with the **service role key** | **BYPASSES RLS entirely**          |

> ⚠️ **`service_role` bypasses ALL RLS.** Use it only for trusted server-side
> jobs (sending notifications, writing `invoices` / `payroll_runs` / `audit_logs`,
> the migration/seed scripts). **Never** run a user-influenced query through the
> service role without re-checking authorization in code — doing so defeats the
> entire security model.

### Who am I? — `app_current_user_id()`

Every policy resolves the caller's identity through one function:

```sql
app_current_user_id() RETURNS uuid   -- the profiles.id / auth.users.id, or NULL
```

It reads, in order:

1. `request.jwt.claims ->> 'sub'` — set **automatically** by Supabase on every
   authenticated PostgREST/Realtime request. **If you use the Supabase client
   with the user's JWT, you get this for free — do nothing.**
2. `current_setting('app.current_user_id')` — a fallback GUC for code paths that
   talk to Postgres directly (the RLS test suite uses this to impersonate).

---

## 2. How to call the DB from a service (pick one)

### Option A — Supabase client per request (recommended for user actions)

Forward the user's access token so the request runs as `authenticated` and
`app_current_user_id()` resolves from the JWT. RLS does the rest.

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
});
// This SELECT already returns ONLY rows this user may see.
const { data } = await supabase.from('applications').select('*');
```

### Option B — direct `pg` connection acting as a user

If you query Postgres directly (e.g. `pg` pool) and want RLS enforced, set the
identity GUC and role **inside a transaction** (so it's scoped via `SET LOCAL`):

```ts
await client.query('BEGIN');
await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
await client.query('SET LOCAL ROLE authenticated');
// ... your queries run with RLS as this user ...
await client.query('COMMIT'); // or ROLLBACK
```

This is exactly the pattern `__tests__/rls.test.ts` uses. `set_config(..., true)`
== `SET LOCAL`, and it's parameterized (no SQL injection).

### Option C — service role (trusted jobs only)

Use the service role key / connection. RLS is bypassed; **you are responsible
for every authorization check.** Reserve for: emitting notifications, billing
writes, audit logging, cron/back-office tasks.

---

## 3. Authorization helper functions (callable from SQL / policies)

These are `SECURITY DEFINER` (they intentionally bypass RLS internally to avoid
policy recursion) and return booleans. You generally won't call them directly —
the policies do — but they document the rules, and you can reuse them in your
own SQL (e.g. a server-side `rpc`).

| Function                               | True when…                                                      |
| -------------------------------------- | --------------------------------------------------------------- |
| `app_current_user_id() -> uuid`        | returns the caller's profile id (or NULL)                       |
| `app_is_authenticated() -> bool`       | there is a logged-in caller                                     |
| `is_admin() -> bool`                   | caller's `profiles.role = 'admin'`                              |
| `owns_worker_profile(wp uuid) -> bool` | caller owns that `worker_profiles.id`                           |
| `is_company_member(co uuid) -> bool`   | caller holds **any** seat in `company_members` for that company |
| `is_company_admin(co uuid) -> bool`    | caller's company seat is `owner` or `admin`                     |
| `is_conversation_participant(c uuid)`  | caller is in `conversation_participants` for that conversation  |
| `can_read_listing(l uuid) -> bool`     | the listing is `open`, **or** caller is a member of its company |
| `can_manage_listing(l uuid) -> bool`   | caller is a member of the listing's company                     |

---

## 4. Access rules per table (what your endpoints can rely on)

- **profiles** — SELECT/UPDATE is **self only** (or admin). There is no
  "read anyone's profile" policy by design. For public-facing display data
  (e.g. a poster's name on a listing), build a **dedicated view** exposing only
  safe columns rather than opening this table.
- **worker_profiles / worker_skills** — readable by any authenticated user
  (talent directory); writable only by the owner.
- **categories / skills** — world-readable; **admin-only** writes.
- **company_profiles** — world-readable; insert by the owner; update by
  `owner`/`admin` members. **company_members** — visible to fellow members;
  managed by `owner`/`admin`.
- **listings** (+ `freelance_details` / `fulltime_details` / `listing_skills`) —
  `open` ones are public (even `anon`); drafts and all writes are company-only.
  Remember the **unified model**: branch on `listings.type`
  (`'freelance' | 'fulltime'`) and join the matching detail table.
- **applications** — applicant **and** hiring company can read; applicant
  creates; both sides may update (worker withdraws, company changes status).
- **offers** — worker + company read; company creates/edits; worker may update
  status to accept/decline.
- **engagements** (revenue spine) — worker + company read; company writes.
  **Fee rates are snapshotted columns** (`placement_fee_rate`,
  `recurring_fee_rate`, `payroll_fee_rate`) — bill from the engagement row, never
  from a live config lookup.
- **conversations / messages / message_translations** — strictly
  participant-only. A message INSERT requires `sender_id = caller` **and**
  participant membership.
- **invoices / payroll_runs / payments** — readable by the involved company
  (and worker, for payroll); **all writes are service-role/admin only**.
- **subscriptions** — owner (person or company admin) reads/writes.
- **reviews** — public ones are world-readable; author/subject see their own.
- **disputes** — visible to the parties + admin.
- **verification_documents** — sensitive PII: **owner + admin only**; status is
  changed by admins (owner cannot self-approve).
- **notifications** — recipient only; **INSERT is service-role only** (the
  backend emits them).
- **audit_logs** — admin read; **writes are service-role only**, append-only.

---

## 5. Important nuances (these will bite if missed)

- **worker_profile ≠ profile.** `applications`, `offers`, `engagements`,
  `payroll_runs` reference `worker_profiles.id`, **not** `profiles.id`. Resolve
  the caller's `worker_profiles` row first. Ownership is checked via
  `owns_worker_profile()`.
- **A blocked read is empty, not an error.** Under RLS a forbidden SELECT/UPDATE
  simply returns/affects **0 rows** — no exception. Don't treat "0 rows" as
  merely "not found"; it can mean "not allowed." Check existence with the
  service role if you need to distinguish 404 from 403.
- **A blocked write IS an error.** A forbidden INSERT (or UPDATE failing
  `WITH CHECK`) raises `new row violates row-level security policy for table …`.
  Map this to your standard error shape:
  `{ success: false, error: '…', code: 'UNAUTHORIZED' }` (HTTP 403).
- **Detail-table inserts follow the listing.** Insert `freelance_details` /
  `fulltime_details` only after the parent `listings` row exists and you're a
  company member (`can_manage_listing`).
- **XOR constraints exist.** `payments` settles exactly one of
  `invoice_id` / `payroll_run_id`; `subscriptions` belongs to exactly one of
  `subscriber_profile_id` / `company_id`. Violations raise a CHECK error.

---

## 6. Running things

```bash
# from apps/api
npm run migrate   # apply pending migrations (idempotent, transactional)
npm run seed      # idempotent dev data (5 cats, 20 skills, 2 users, 1 co, 2 listings)
npm run test      # vitest — includes the 21-test RLS suite

# seed/test logins (dev only):
#   worker@chinatalent.dev / Password123!
#   employer@chinatalent.dev / Password123!
```

`DATABASE_URL` must point at the Supabase **session pooler**
(`...pooler.supabase.com:5432`, user `postgres.<ref>`) — the direct
`db.<ref>.supabase.co` host is IPv6-only and won't resolve on IPv4 networks.

Questions on any rule above → ping @qa.
