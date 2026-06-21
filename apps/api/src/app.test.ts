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
