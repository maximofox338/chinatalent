/**
 * Supabase connection smoke test.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from apps/api/.env, runs a
 * lightweight authenticated query, and reports success/failure.
 *
 * Run from apps/api:   npx ts-node src/db/test-connection.ts
 * Run from repo root:  npx ts-node --project apps/api/tsconfig.json apps/api/src/db/test-connection.ts
 *
 * SECURITY: this script never prints credential values, only whether they loaded.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  fail('SUPABASE_URL is not set in apps/api/.env');
}
if (!serviceRoleKey) {
  fail('SUPABASE_SERVICE_ROLE_KEY is not set in apps/api/.env');
}

// Confirm the variables are present without ever echoing their values.
console.log('SUPABASE_URL loaded:              yes');
console.log('SUPABASE_SERVICE_ROLE_KEY loaded: yes');

async function main(supabaseUrl: string, supabaseServiceRoleKey: string): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Running test query against Supabase…');

  // auth.admin.listUsers is a minimal, table-independent query that requires a
  // valid project URL + service role key — ideal before any schema exists.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

  if (error) {
    fail(`Connection FAILED: ${error.message}`);
  }

  console.log('✅ Connection OK — Supabase accepted an authenticated request.');
  console.log(`   Probe returned ${data.users.length} user record(s) on page 1.`);
}

main(url, serviceRoleKey).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(`Unexpected error: ${message}`);
});
