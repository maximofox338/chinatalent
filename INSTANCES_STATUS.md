# INSTANCES_STATUS.md — China Talent Bridge

## El "heartbeat" de coordinación: qué se hizo, qué falta, quién hace qué

> **Última actualización**: Fin Día 3 — Fase 0 COMPLETA y VALIDADA. Login funciona end-to-end. Próximo: auditoría.

---

## 🎉 HITO: LA PLATAFORMA ESTÁ VIVA

El smoke test end-to-end se completó con éxito. Un usuario real se registró, recibió el magic link, hizo click, y se logueó al dashboard. Toda la cadena (frontend → backend → Supabase) funciona.

---

## ESTADO POR AGENTE

### @backend — Fase 0 COMPLETA ✅

- Servidor Express (createApp factory), auth middleware (Supabase JWT validation).
- Endpoints: POST /api/auth/register, GET /api/auth/me, POST /api/auth/logout, /api/profiles/me, /api/workers, /api/companies.
- Respeta contrato RLS: cliente con JWT del usuario por defecto; service_role solo para bootstrap del company owner (con re-check en código).
- **CORS agregado** (commit 3e97f7f): middleware primero en la cadena, whitelist configurable vía env var CORS_ORIGIN (default http://localhost:5173, acepta lista separada por comas). Methods: GET/POST/PATCH/OPTIONS. Headers: Content-Type/Authorization. Sin credentials (usa bearer tokens). Probado: preflight devuelve los headers, origen no permitido NO recibe ACAO.
- Tests: 21/21 propios + 2 de CORS pasan. Requiere SUPABASE_ANON_KEY en apps/api/.env.

### @frontend — Fase 0 COMPLETA ✅

- Auth shell: supabase client, useAuth/useProfile, api.ts, Login/Register/Dashboard/NotFound, Layout/ProtectedRoute/Spinner, routing, Tailwind v4.
- **Fix country** (commit 8b83743): Register.tsx enviaba country_code, el backend espera country. Arreglado y verificado con registro real (201).
- Smoke test e2e ejecutado por @frontend: backend boots ✅, frontend boots ✅, auth flow verificado contra Supabase live (register → me → profile lifecycle).

### @qa — Fase 0 COMPLETA ✅

- Migraciones 001-015 (28 tablas, RLS forzada), migrate.ts, seed.ts, rls.test.ts (21/21 en live Supabase), HELPERS.md.
- DATABASE_URL usa Session pooler (resuelto).

### @devops — Fase 0 COMPLETA ✅

- Monorepo, Node 20, linters/husky, .env.example, CI pipeline (verde), A6 Sentry (backend + frontend, no-op si no hay DSN).

### @architect — Diseño COMPLETO ✅

- ARCHITECTURE.md (ahora en el repo), SCHEMA.sql, API_CONTRACT.md, 10 ADRs, 28-table schema.
- PRÓXIMA TAREA: diseñar los 3 checklists de auditoría (ver plan abajo).

---

## TODO EN MAIN (sincronizado en GitHub)

- Repo: github.com/maximofox338/chinatalent
- Fase 0 completa, login e2e funcionando, todo pusheado.

---

## PRÓXIMO PASO: AUDITORÍA (antes de Fase 1)

Secuencia acordada:

1. ✅ ETAPA 0 — Smoke test (COMPLETO).
2. ⏳ ETAPA 1 — @architect diseña 3 checklists de auditoría (seguridad, arquitectura, funcional). ← SIGUIENTE
3. ⏳ ETAPA 2 — Auditores FRESCOS ejecutan read-only en paralelo (seguridad + arquitectura).
4. ⏳ ETAPA 3 — Fundador + estratega priorizan hallazgos (crítico/menor/nice-to-have).
5. ⏳ ETAPA 4 — Constructores arreglan lo crítico.
6. ⏳ ETAPA 5 — Fase 1 (job browser, listings).

Principio: quien audita NO es quien construyó (auditores = instancias frescas, read-only).

---

## PENDIENTES TÉCNICOS (a resolver en auditoría/fix o antes de Fase 1)

1. **Reconciliar tipos compartidos** (packages/shared): Project/Job → Listing unificado (ADR-002), y camelCase → snake_case para matchear la API. Consecuencia confirmada: Dashboard mostraba "Welcome, there!" en vez del nombre. REQUERIDO antes de Fase 1.
2. **ErrorCode union obsoleto**: quitar PROJECT_NOT_FOUND, agregar NOT_FOUND y CONFLICT.
3. **rls.test.ts timeouts**: subir testTimeout para la suite de DB live (latencia del pooler, no bug).
4. **Rotar token de GitHub** expuesto, antes de wirear credenciales de deploy.
5. **Bump actions/checkout y setup-node a v5** (limpiar warning de Node 20 deprecation en CI).

---

## DEPLOYMENT (diferido)

@devops listo para Vercel + Railway cuando se decida shippear a staging. Requiere antes: rotar token + auditoría. Vercel MCP tools conectadas del lado de @devops.

---

## CÓMO ARRANCAR CADA DÍA

1. cd C:\Users\arbit\Desktop\chinatalent
2. git pull origin main
3. Lanzar agentes NUEVOS con sus resume prompts (.claude/agents/)
4. Cada agente: commit local, NO push. El fundador coordina pushes.
