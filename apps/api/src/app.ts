import express, { type Express, type Request, type Response } from 'express';
import type { ApiResponse, User } from '@chinatalent/shared';

/**
 * Builds the Express application. Kept separate from server startup so tests
 * can exercise routes without binding a port (see app.test.ts).
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Health check.
  app.get('/health', (_req: Request, res: Response) => {
    const body: ApiResponse<{ status: 'ok' }> = {
      success: true,
      data: { status: 'ok' },
    };
    res.json(body);
  });

  // Placeholder for the auth "me" endpoint (see API_CONTRACT.md).
  app.get('/api/auth/me', (_req: Request, res: Response) => {
    const body: ApiResponse<User> = {
      success: false,
      error: 'Not implemented',
      code: 'SERVER_ERROR',
    };
    res.status(501).json(body);
  });

  return app;
}
