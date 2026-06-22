/**
 * Route + middleware + service integration tests.
 *
 * We stub only the network boundary — `lib/supabase` — so the REAL auth
 * middleware, routers, services, validation and error handler all run. The
 * Supabase mock lets each test queue the { data, error } that the next DB query
 * resolves to (FIFO, one entry per `.from()` call), and control whether the JWT
 * verifies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Hoisted mutable state shared with the hoisted vi.mock factory.
const h = vi.hoisted(() => ({
  authUser: null as null | { id: string; email: string },
  queue: [] as Array<{ data: unknown; error: unknown }>,
  signOuts: 0,
}));

vi.mock('./../lib/supabase', () => {
  const TERMINAL = { data: null as unknown, error: null as unknown };
  function makeBuilder() {
    // Capture the result for THIS query at .from() time (FIFO).
    const result = h.queue.shift() ?? TERMINAL;
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'range']) {
      builder[method] = () => builder;
    }
    builder.single = () => Promise.resolve(result);
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return builder;
  }
  const client = {
    from: () => makeBuilder(),
    auth: {
      signOut: () => {
        h.signOuts += 1;
        return Promise.resolve({ error: null });
      },
    },
  };
  return {
    authClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve(
            h.authUser
              ? { data: { user: h.authUser }, error: null }
              : { data: { user: null }, error: { message: 'invalid token' } },
          ),
      },
    }),
    userClient: () => client,
    serviceClient: () => client,
  };
});

// Import AFTER the mock is registered.
import { createApp } from '../app';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'Bearer test-token';

function app() {
  return createApp();
}

function queue(...results: Array<{ data?: unknown; error?: unknown }>): void {
  for (const r of results) {
    h.queue.push({ data: r.data ?? null, error: r.error ?? null });
  }
}

const profile = {
  id: USER_ID,
  role: 'worker',
  display_name: 'Mei',
  full_name: 'Mei Chen',
  avatar_url: null,
  country: 'CN',
  timezone: 'Asia/Shanghai',
  locale: 'en',
  preferred_language: 'en',
  phone: null,
  bio: null,
  is_active: true,
  created_at: '2026-06-22T00:00:00Z',
  updated_at: '2026-06-22T00:00:00Z',
};

beforeEach(() => {
  h.authUser = { id: USER_ID, email: 'mei@chinatalent.dev' };
  h.queue = [];
  h.signOuts = 0;
});

describe('GET /health', () => {
  it('returns 200 { success: true }', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});

describe('requireAuth', () => {
  it('rejects a request with no token (401 INVALID_TOKEN)', async () => {
    const res = await request(app()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects an invalid token (401 INVALID_TOKEN)', async () => {
    h.authUser = null; // getUser returns an error
    const res = await request(app()).get('/api/auth/me').set('Authorization', AUTH);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});

describe('POST /api/auth/register', () => {
  it('creates a profile for a first-time user (201)', async () => {
    queue({ data: null }, { data: profile }); // no existing, then inserted
    const res = await request(app())
      .post('/api/auth/register')
      .set('Authorization', AUTH)
      .send({ role: 'worker', full_name: 'Mei Chen', country: 'CN' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(USER_ID);
    expect(res.body.data.email).toBe('mei@chinatalent.dev');
  });

  it('409 when the profile already exists', async () => {
    queue({ data: profile });
    const res = await request(app())
      .post('/api/auth/register')
      .set('Authorization', AUTH)
      .send({ role: 'worker' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('400 on an unknown field (strict schema)', async () => {
    const res = await request(app())
      .post('/api/auth/register')
      .set('Authorization', AUTH)
      .send({ role: 'worker', hacker: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('400 on an invalid role', async () => {
    const res = await request(app())
      .post('/api/auth/register')
      .set('Authorization', AUTH)
      .send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the profile + email', async () => {
    queue({ data: profile });
    const res = await request(app()).get('/api/auth/me').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('mei@chinatalent.dev');
    expect(res.body.data.role).toBe('worker');
  });

  it('404 USER_NOT_FOUND when not registered', async () => {
    queue({ data: null });
    const res = await request(app()).get('/api/auth/me').set('Authorization', AUTH);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes and returns success', async () => {
    const res = await request(app()).post('/api/auth/logout').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.signed_out).toBe(true);
    expect(h.signOuts).toBe(1);
  });
});

describe('PATCH /api/profiles/me', () => {
  it('updates and returns the profile', async () => {
    queue({ data: { ...profile, bio: 'Updated' } });
    const res = await request(app())
      .patch('/api/profiles/me')
      .set('Authorization', AUTH)
      .send({ bio: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.bio).toBe('Updated');
  });

  it('400 on an empty patch', async () => {
    const res = await request(app()).patch('/api/profiles/me').set('Authorization', AUTH).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });
});

describe('workers', () => {
  const worker = {
    id: '22222222-2222-2222-2222-222222222222',
    profile_id: USER_ID,
    headline: 'Full-stack engineer',
    availability: 'full_time',
    open_to_relocation: false,
    is_verified: false,
  };

  it('GET /api/workers lists', async () => {
    queue({ data: [worker] });
    const res = await request(app()).get('/api/workers').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/workers/:id 404 when missing', async () => {
    queue({ data: null });
    const res = await request(app()).get(`/api/workers/${worker.id}`).set('Authorization', AUTH);
    expect(res.status).toBe(404);
  });

  it('GET /api/workers/:id 400 on a non-uuid', async () => {
    const res = await request(app()).get('/api/workers/not-a-uuid').set('Authorization', AUTH);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('PUT /api/workers/me creates when none exists', async () => {
    queue({ data: null }, { data: worker }); // getOwn → none, then insert
    const res = await request(app())
      .put('/api/workers/me')
      .set('Authorization', AUTH)
      .send({ headline: 'Full-stack engineer', availability: 'full_time' });
    expect(res.status).toBe(200);
    expect(res.body.data.headline).toBe('Full-stack engineer');
  });
});

describe('companies', () => {
  const company = {
    id: '33333333-3333-3333-3333-333333333333',
    owner_profile_id: USER_ID,
    name: 'Acme Co',
    slug: 'acme-co',
    is_verified: false,
  };

  it('POST /api/companies creates company + owner seat (201)', async () => {
    queue({ data: company }, { error: null }); // company insert, then seat insert
    const res = await request(app())
      .post('/api/companies')
      .set('Authorization', AUTH)
      .send({ name: 'Acme Co' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('acme-co');
  });

  it('maps an RLS write violation to 403 UNAUTHORIZED', async () => {
    queue({ error: { code: '42501', message: 'rls' } });
    const res = await request(app())
      .post('/api/companies')
      .set('Authorization', AUTH)
      .send({ name: 'Acme Co' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/companies/:id 404 when missing', async () => {
    queue({ data: null });
    const res = await request(app()).get(`/api/companies/${company.id}`).set('Authorization', AUTH);
    expect(res.status).toBe(404);
  });
});

describe('unmatched route', () => {
  it('404 NOT_FOUND', async () => {
    const res = await request(app()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
