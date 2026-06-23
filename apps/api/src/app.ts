import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import authRouter from './api/auth';
import profilesRouter from './api/profiles';
import workersRouter from './api/workers';
import companiesRouter from './api/companies';
import { errorHandler, notFound } from './middleware/error';
import { sentryEnabled } from './instrument';
import { env } from './lib/env';
import { sendOk } from './utils/http';

/**
 * Builds the Express application. Kept separate from server startup so tests
 * can exercise routes without binding a port (see app.test.ts).
 *
 * Order matters: CORS → JSON body parsing → feature routers → 404 fallback →
 * error handling. CORS runs first so preflight (OPTIONS) requests are answered
 * before any router, and so the Access-Control-Allow-* headers are present even
 * on error responses. Sentry's error handler then captures, and ours formats
 * the standard { success, error, code } envelope.
 */
export function createApp(): Express {
  const app = express();

  // CORS — must run before routes so browser preflight (OPTIONS) succeeds and
  // every response (including errors) carries the Access-Control-Allow-* headers.
  // Origins are configurable via CORS_ORIGIN (comma-separated); see .env.example.
  // We authenticate with bearer tokens in the Authorization header (no cookies),
  // so credentials are left off. optionsSuccessStatus=200 keeps preflight on 200.
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      optionsSuccessStatus: 200,
    }),
  );

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
