# API Contract

## Status: Auth + profiles + directory LIVE (@backend) · marketplace endpoints planned

### Base URL

- Development: http://localhost:3000
- Staging: https://api-staging.chinatalent.app
- Production: https://api.chinatalent.app

### Authentication

- Magic link via Supabase Auth (ADR-001 — no passwords). The frontend completes
  the magic-link sign-in with Supabase and receives a JWT.
- Every protected endpoint requires `Authorization: Bearer <supabase-jwt>`.
- The API verifies the JWT with Supabase (`auth.getUser`) and runs all DB work
  through an RLS-scoped client, so a user can only ever touch their own data.

### Response Format (ALL endpoints)

```json
{
  "success": true,
  "data": {},
  "error": "string (only when success=false)",
  "code": "ERROR_CODE (only when success=false)"
}
```

- Request and response bodies are **snake_case** (e.g. `full_name`, `country`).

### Error Codes

| code             | HTTP | meaning                                            |
| ---------------- | ---- | -------------------------------------------------- |
| `INVALID_TOKEN`  | 401  | missing / invalid / expired bearer token           |
| `UNAUTHORIZED`   | 403  | authenticated but not allowed (RLS denied a write) |
| `INVALID_INPUT`  | 400  | body/query/params failed validation                |
| `NOT_FOUND`      | 404  | resource not found (or not visible to caller)      |
| `USER_NOT_FOUND` | 404  | caller has no profile yet (needs to register)      |
| `CONFLICT`       | 409  | resource already exists                            |
| `SERVER_ERROR`   | 500  | unexpected server error                            |

---

## Implemented endpoints

### Auth — `/api/auth` (thin; Supabase owns the magic link)

```
POST /api/auth/register   Create the caller's profile after first sign-in.
                          Body (all optional): role('worker'|'employer'),
                          display_name, full_name, country(ISO-2), timezone,
                          locale, preferred_language, phone, bio.
                          → 201 { ...profile, email } | 409 if already registered
GET  /api/auth/me         The caller's profile + email.
                          → 200 { ...profile, email } | 404 USER_NOT_FOUND
POST /api/auth/logout     Best-effort token revocation. → 200 { signed_out: true }
```

### Profiles — `/api/profiles` (self-service only)

```
GET   /api/profiles/me    → 200 profile | 404 USER_NOT_FOUND
PATCH /api/profiles/me    Update own profile (>=1 of: display_name, full_name,
                          avatar_url, country, timezone, locale,
                          preferred_language, phone, bio). → 200 profile
```

> Reading other users' profiles is intentionally not exposed: `profiles` is
> self-only under RLS. Use the worker directory for public talent data.

### Workers — `/api/workers` (talent directory)

```
GET /api/workers          List worker profiles. Query: ?limit (1-100, def 20)
                          &offset (def 0). → 200 worker[]
GET /api/workers/me       The caller's worker profile. → 200 | 404
PUT /api/workers/me       Create or update own worker profile (headline, summary,
                          years_experience, hourly_rate_usd, availability,
                          english_level, chinese_level, open_to_relocation,
                          portfolio_url, resume_url). → 200 worker
GET /api/workers/:id      A worker profile by worker_profiles.id. → 200 | 404
```

### Companies — `/api/companies`

```
GET   /api/companies      List companies. Query: ?limit&offset. → 200 company[]
POST  /api/companies      Create a company; caller becomes its owner. Body:
                          name (required), slug?, website?, description?,
                          industry?, size?, headquarters_country?, logo_url?.
                          → 201 company
GET   /api/companies/:id  A company by id. → 200 | 404
PATCH /api/companies/:id  Update a company (owner/admin members only). → 200 | 403
```

---

## Planned endpoints (later phases — not yet implemented)

```
GET/POST  /api/listings          unified freelance + fulltime (ADR-002)
GET       /api/listings/:id
POST      /api/listings/:id/apply
GET       /api/applications      my applications
POST      /api/offers            make an offer
GET/POST  /api/messages          conversations
```

---

**Updated by**: @backend
**Last update**: 2026-06-22 — auth, profiles, workers, companies live + tested
