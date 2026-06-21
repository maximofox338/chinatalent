/**
 * Migration runner for China Talent Bridge.
 *
 * Reads every *.sql file in ./migrations in ascending (numeric) order and
 * applies the ones that have not run yet, tracking applied files in a
 * `schema_migrations` table. Each file runs inside its own transaction, so a
 * failed migration rolls back cleanly and leaves the tracking table accurate.
 *
 * Idempotent: running it repeatedly is a no-op once everything is applied.
 *
 *   Run from apps/api:  npx ts-node src/db/migrate.ts
 *
 * Requires DATABASE_URL (Supabase Postgres connection string) in apps/api/.env.
 * Connects as the privileged migration role; the migration SQL itself sets up
 * RLS for the anon/authenticated/service roles used at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail('DATABASE_URL is not set in apps/api/.env');
}

// Supabase (and most hosted Postgres) require TLS. Local databases generally do
// not, so we only relax/skip SSL for an explicit localhost connection.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(databaseUrl);
const ssl = isLocal ? false : { rejectUnauthorized: false };

/** Returns the ordered list of migration filenames. */
function migrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fail(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // zero-padded numeric prefixes sort correctly lexicographically
}

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedSet(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.filename));
}

async function main(connectionString: string): Promise<void> {
  const client = new Client({ connectionString, ssl });
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const already = await appliedSet(client);
    const files = migrationFiles();

    const pending = files.filter((f) => !already.has(f));
    if (pending.length === 0) {
      console.log(`✅ Up to date — ${files.length} migration(s) already applied.`);
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`  → ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('done');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const message = err instanceof Error ? err.message : String(err);
        fail(`FAILED on ${file}: ${message}`);
      }
    }

    console.log(`✅ Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main(databaseUrl).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(`Unexpected error: ${message}`);
});
