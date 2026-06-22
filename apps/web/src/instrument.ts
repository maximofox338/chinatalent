/**
 * Sentry initialization for the web app.
 *
 * Imported first in main.tsx. No-op unless VITE_SENTRY_DSN is set, so local
 * dev runs clean without a DSN. (The ErrorBoundary in main.tsx still works as
 * a plain React error boundary when Sentry is disabled — it just won't report.)
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Whether Sentry was initialized (DSN present). */
export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Full tracing in dev for visibility; sampled in production.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}
