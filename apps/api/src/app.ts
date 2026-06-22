import express, { type Express, type Request, type Response } from 'express';
import * as Sentry from '@sentry/node';
import authRouter from './api/auth';
import profilesRouter from './api/profiles';
import workersRouter from './api/workers';
import companiesRouter from './api/companies';
import { errorHandler, notFound } from './middleware/error';
import { sentryEnabled } from './instrument';
import { sendOk } from './utils/http';

/**
 * Builds the Express application. Kept separate from server startup so tests
 * can exercise routes without binding a port (see app.test.ts).
 *
 * Order matters: JSON body parsing → feature routers → 404 fallback → error
 * handling. Sentry's error handler runs first (to capture), then ours formats
 * the standard { success, error, code } envelope.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Health check (no auth, no DB).
  app.get('/health', (_req: Request, res: Response) => {
    sendOk(res, { status: 'ok' as const });
  });

  // Feature routers.
  app.use('/api/auth', authRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/companies', companiesRouter);

  // Unmatched routes.
  app.use(notFound);

  // Error handling — must come after all routes. Sentry captures first, then
  // our handler responds with the standard shape.
  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.use(errorHandler);

  return app;
}
