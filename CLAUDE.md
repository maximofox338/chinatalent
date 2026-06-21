\# China Talent Bridge - Shared Context

\## Project Overview

Platform for hiring Asia talent, full-time employment + freelance.

Legal, secure, no VPN evasion.

\## Tech Stack (FINAL)

\- Backend: Node.js 20 + Express + TypeScript

\- Frontend: React 18 + TypeScript + Tailwind CSS

\- Database: PostgreSQL (Supabase managed)

\- Auth: Supabase Auth (magic links)

\- Real-time: Socket.io

\- Translation: Google Cloud Translate API

\- Hosting: Vercel (frontend) + Railway (backend)

\- Monitoring: Sentry

\## Architecture Principles

1\. TypeScript strict mode ALWAYS

2\. Tests >80% coverage

3\. Error format: {success: boolean, error?: string, code?: string}

4\. Parameterized queries (no SQL injection)

5\. No hardcoded secrets

6\. Clear git commits: "Feature: X" or "Fix: Y"

\## Project Structure

```

src/

&#x20; /api           - Express routes

&#x20; /services      - Business logic

&#x20; /models        - Database models

&#x20; /middleware    - Express middleware

&#x20; /utils         - Utilities

&#x20; /components    - React components

&#x20; /pages         - React pages

&#x20; /hooks         - Custom React hooks

&#x20; /lib           - External libraries config

&#x20; /db            - Database migrations

&#x20; /types         - TypeScript types

```

\## Current Status

\- \*\*Phase\*\*: MVP Development

\- \*\*Architecture\*\*: In design by @architect

\- \*\*Backend\*\*: Waiting for design

\- \*\*Frontend\*\*: Waiting for API contract

\- \*\*Database\*\*: Waiting for design

\- \*\*Testing\*\*: Waiting for code

\- \*\*Deployment\*\*: Waiting for all code

\## Key Files (Living Documents)

\- API_CONTRACT.md - What APIs exist

\- COMPONENT_SPECS.md - What components exist

\- SCHEMA.sql - Database structure

\- INSTANCES_STATUS.md - Who's doing what

\## Decision Log

(Will be updated by @architect)

\## Decisions Made

(None yet, will be filled by @architect)

\## Known Risks

(Will be identified by @architect and @qa)

\## Model: Full-Time Employment + Freelance

This is NOT just Upwork.

This is a platform for:

1\. Workers to get full-time remote jobs from international companies

2\. Companies to hire full-time remote teams from Asia

3\. Some freelance work on the side

\## Revenue Model

1\. 10% commission on first year salary (employment)

2\. 5% recurring annual fee (employment retention)

3\. 1-2% payroll processing fee

4\. Premium tools and services

\## Compliance Notes

\- NO VPN CODE

\- Uses ONLY official APIs

\- Legal contracts for employment

\- Terms of Service reviewed

\## Next Steps

1\. @architect: Design complete architecture (2-3 hours)

2\. @backend: Implement APIs (parallel)

3\. @frontend: Build components (parallel)

4\. @qa: Write tests \& design DB (parallel)

5\. @devops: Deploy to staging (when others done)

```

```
