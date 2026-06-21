# China Talent Bridge

Platform for hiring Asia talent — full-time remote employment plus freelance work.
Legal, secure, no VPN evasion.

## Monorepo layout

This repository is an [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo.

```
chinatalent/
├── packages/
│   └── shared/    @chinatalent/shared — shared TypeScript types
├── apps/
│   ├── api/       @chinatalent/api    — backend (Express + TypeScript)
│   └── web/       @chinatalent/web    — frontend (React + TypeScript)
├── package.json       root workspaces config
├── tsconfig.base.json shared TS config (strict mode)
├── .eslintrc.json
└── .prettierrc
```

Both apps import shared interfaces from `@chinatalent/shared`.

## Getting started

```bash
npm install          # installs all workspaces and links @chinatalent/shared
npm run typecheck    # type-check every workspace
npm run dev          # run dev servers (api + web)
npm run build        # build every workspace
```

## Tech stack

- Backend: Node.js 18 + Express + TypeScript
- Frontend: React 18 + TypeScript + Tailwind CSS
- Database: PostgreSQL (Supabase managed)
- Auth: Supabase Auth (magic links)
- Hosting: Vercel (web) + Railway (api)

See [CLAUDE.md](./CLAUDE.md) for the full project context.
