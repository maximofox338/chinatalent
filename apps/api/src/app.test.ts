import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { ApiResponse } from '@chinatalent/shared';
import { createApp } from './app';

describe('GET /health', () => {
  it('returns 200 with { success: true }', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);

    const body = res.body as ApiResponse<{ status: 'ok' }>;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: 'ok' });
  });
});

describe('CORS', () => {
  const ORIGIN = 'http://localhost:5173';

  it('reflects the allowed origin on a simple request', async () => {
    const res = await request(createApp()).get('/health').set('Origin', ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('answers preflight OPTIONS with the Access-Control-Allow-* headers', async () => {
    const res = await request(createApp())
      .options('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});
