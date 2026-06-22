/**
 * Sentry initialization for the API.
 *
 * This module MUST be imported before any other application code (see
 * index.ts) so Sentry can auto-instrument http/express before they load.
 *
 * It is a no-op unless SENTRY_DSN is set, so local dev and tests run clean
 * without a DSN. Load .env here too — index.ts otherwise reads env straight
 * from the process, but SENTRY_DSN typically lives in apps/api/.env in dev.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dsn = process.env.SENTRY_DSN;

/** Whether Sentry was initialized (DSN present). Other modules can branch on this. */
export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Capture a sample of performance traces; full in non-prod for visibility.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  // eslint-disable-next-line no-console
  console.log('Sentry enabled for API');
}
