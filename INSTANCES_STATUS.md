# Instances Status — End of Day 1 (2026-06-22)

═══════════════════════════════════════════════════════════════

\## ÚLTIMO UPDATE: Fin Primera sesión Día 2 (2026-06-22)

FASE 0 COMPLETA ✅ (todo en main, pusheado)

\- @backend: auth endpoints DONE (register, me, logout + profiles/workers/companies)

\- @devops: Sentry DONE

\- Todo mergeado a main (PR #2)

PRÓXIMO PASO (Día 3):

1\. SMOKE TEST end-to-end: lanzar @frontend, probar login real

&#x20; (frontend ↔ backend ↔ Supabase) ← EL OBJETIVO

2\. Si funciona: empezar Fase 1 (job browser, listings)

3\. Pendiente menor: reconciliar shared types (Project/Job → Listing)

4\. Pendiente menor: subir testTimeout para rls.test.ts (timeouts de red)

5\. Pendiente: rotar token antes de deployment═══════════════════════════════════════════════════════════════

## @architect — COMPLETE ✅

═══════════════════════════════════════════════════════════════
Entregó: ARCHITECTURE.md, SCHEMA.sql, API_CONTRACT.md

- 28 tablas, 10 ADRs con tradeoffs, análisis de riesgos
- Modelo: empleo full-time + freelance unificado en "listings"
- Engagements = revenue spine (fees 0.10/0.05/0.02)
- Plan de 5 fases (marketplace antes que pagos)
  Riesgos legales flaggeados: EOR, pagos cross-border, PIPL/GDPR.

═══════════════════════════════════════════════════════════════

## @devops — Phase 0 COMPLETE ✅ (en PR, sin mergear)

═══════════════════════════════════════════════════════════════
Branch: phase-0-infrastructure (8 commits, todo Fase 0)
Commits propios: 1bddb38 (CI), 802ebda (Register fix), c3cc484 (pg)
Entregó:

- Monorepo (npm workspaces: shared, api, web)
- Vite 8 + plugin-react 6 (0 vulnerabilidades)
- Node 20 estandarizado (engines en los 3 package.json)
- TS strict, ESLint, Prettier, husky, .editorconfig, .prettierignore
- .env.example (ambas apps) + test-connection.ts (verificado live)
- CI pipeline (.github/workflows/ci.yml) — verde, 22 tests
- createApp factory + test harness listos para @backend
  CI atrapó 3 bugs reales antes de correr en remoto.
  PENDIENTE: A6 (Sentry) — MAÑANA

═══════════════════════════════════════════════════════════════

## @qa — Phase 0 COMPLETE ✅ (en PR, sin mergear)

═══════════════════════════════════════════════════════════════
Commits: 15861df (migrations+seed+tests), cf3fae6 (path fix), HELPERS.md
Entregó (todo en apps/api/src/db/):

- 15 migraciones idempotentes (001-015) → 28 tablas
- RLS habilitado + FORCED en las 28 tablas
- migrate.ts (transaccional, re-run-safe)
- seed.ts (5 categorías, 20 skills, 2 users, 1 company, 2 listings)
- **tests**/rls.test.ts (21 tests)
- HELPERS.md ← @backend DEBE leer esto antes de escribir services
- SCHEMA.sql (root, consolidado)
  Verificado en Supabase LIVE: migrate 15/15, seed ok, RLS 21/21 PASS.
  Helpers clave: app_current_user_id(), is_company_member()
  Nota: service_role bypassa RLS (solo trusted jobs: billing, audit).

═══════════════════════════════════════════════════════════════

## @frontend — Phase 0 COMPLETE ✅ (en PR, sin mergear)

═══════════════════════════════════════════════════════════════
Commit: 0184c2f — auth foundation + app shell (17 files, apps/web/)
Entregó:

- lib/supabase.ts, hooks/useAuth.tsx, hooks/useProfile.tsx
- lib/api.ts (Bearer token, {success,data,error,code})
- pages: Login, Register, Dashboard, NotFound
- components: Layout, ProtectedRoute, Spinner
- App.tsx, main.tsx (routing + Tailwind v4)
  Tested: typecheck/build/lint pass.
  NOT tested: sin runtime en browser, sin backend (no e2e todavía).
  Decisión: usar React Query para data-fetching en Phase 1.
  Next (Phase 1): smoke test auth, luego JobCard/SearchForm/listings.

═══════════════════════════════════════════════════════════════

## @backend — NOT STARTED ⏳ (PRIORIDAD #1 MAÑANA)

═══════════════════════════════════════════════════════════════
UNBLOCKED — tiene todo lo que necesita:

- DB viva en Supabase
- HELPERS.md (cómo conectar sin romper RLS)
- API_CONTRACT.md (qué endpoints)
- SCHEMA.sql (estructura)
- createApp factory + test harness (de @devops)
  Primeras tareas:

1. Express skeleton (apps/api/src/index.ts ya parcial, usar createApp)
2. Auth middleware (validar Supabase JWT)
3. /api/auth/register + /api/auth/me + logout
4. Profile endpoints
   DEBE LEER apps/api/src/db/HELPERS.md ANTES de escribir services.
   @frontend espera estos endpoints para test e2e.

═══════════════════════════════════════════════════════════════

## ESTADO DEL PR / GIT

═══════════════════════════════════════════════════════════════

- Branch phase-0-infrastructure pusheado a GitHub (8 commits)
- PR abierto (draft) — esperando CI verde → merge a main
- Una vez mergeado: main tendrá todo Fase 0 unificado
- TOKEN: rotar después del merge (se expuso con workflow scope)

═══════════════════════════════════════════════════════════════

## ISSUES CONOCIDOS A RESOLVER

═══════════════════════════════════════════════════════════════

1. Shared types: Project/Job (viejo) → Listing unificado (ADR-002).
   Arreglar antes de Phase 1. Territorio: packages/shared.
2. snake_case (API, correcto) vs camelCase (shared types).
   Arreglar shared types a snake_case.
3. DATABASE_URL: usa SESSION POOLER (pooler.supabase.com:5432).
   Direct host es IPv6-only. Password URL-encoded (@→%40). ✅ resuelto.

═══════════════════════════════════════════════════════════════

## PRIORIDADES DÍA 2 (en orden)

═══════════════════════════════════════════════════════════════ 0. Merge el PR de Fase 0 (CI verde → merge) + rotar token

1. Launch @backend → auth endpoints (CRÍTICO, leer HELPERS.md)
2. @devops → A6 Sentry
3. Reconciliar shared types (Project/Job → Listing, snake_case)
4. End-to-end smoke test (frontend ↔ backend) → ¡Login funcionando!

═══════════════════════════════════════════════════════════════

## RESUME PROMPTS: ver .claude/agents/

═══════════════════════════════════════════════════════════════
backend-resume.md, frontend-resume.md, qa-resume.md, devops-resume.md
