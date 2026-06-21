\# API Contract

\## Status: In Design by @architect/@backend

\### Base URL

\- Development: http://localhost:3000

\- Staging: https://api-staging.chinatalent.app

\- Production: https://api.chinatalent.app

\### Authentication

\- Magic link via Supabase Auth

\- Response: Bearer token (JWT)

\- Header: Authorization: Bearer \[token]

\### Response Format (ALL endpoints)

```json

{

&#x20; "success": true/false,

&#x20; "data": { /\* if success \*/ },

&#x20; "error": "string", /\* if error \*/

&#x20; "code": "ERROR\_CODE" /\* error identifier \*/

}

```

\### Endpoints (To be filled by @backend)

\#### Auth Endpoints

```

POST /api/auth/register

POST /api/auth/login

GET /api/auth/me

POST /api/auth/logout

```

\#### Job/Project Endpoints

```

GET /api/projects (list)

POST /api/projects (create)

GET /api/projects/:id (details)

POST /api/projects/:id/apply (apply)

GET /api/applications (my applications)

```

\#### Message Endpoints

```

POST /api/messages (send)

GET /api/messages/:assignmentId (conversation)

```

\#### Employment Endpoints (NEW)

```

GET /api/jobs (full-time jobs)

POST /api/jobs (post full-time job)

POST /api/jobs/:id/offer (make offer)

GET /api/my-employment (current employment)

```

\### Error Codes

```

USER\_NOT\_FOUND

INVALID\_TOKEN

INVALID\_INPUT

PROJECT\_NOT\_FOUND

UNAUTHORIZED

SERVER\_ERROR

```

\---

\*\*Updated by\*\*: @backend

\*\*Last update\*\*: \[Date]

```

```
