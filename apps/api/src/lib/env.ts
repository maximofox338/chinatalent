/**
 * Centralised, validated environment access.
 *
 * Loading is LAZY and memoised: importing this module never throws, so unit
 * tests can build the app (and hit env-free routes like /health) without any
 * Supabase credentials present. The first piece of code that actually needs a
 * value triggers validation, and a missing variable fails loudly with a clear
 * message instead of a vague `undefined` deref deep in the SDK.
 */
import path from 'node:path';
import dotenv from 'dotenv';

let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  // src/lib/env.ts → apps/api/.env is two levels up.
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  loaded = true;
}

function required(name: string): string {
  ensureLoaded();
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy apps/api/.env.example to apps/api/.env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  ensureLoaded();
  return process.env[name] ?? fallback;
}

/**
 * Validated env, read on demand. Each property is a getter so that merely
 * referencing `env` (e.g. for `env.port`) never forces the Supabase keys to
 * exist — only the property you read is validated.
 */
export const env = {
  get supabaseUrl(): string {
    return required('SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return required('SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get nodeEnv(): string {
    return optional('NODE_ENV', 'development');
  },
  get port(): number {
    return Number(optional('PORT', '3000'));
  },
};
