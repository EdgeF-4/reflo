import { Pool } from 'pg';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve the migrations directory across local and container layouts. */
export function resolveMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(process.cwd(), 'db', 'migrations'),
    '/app/db/migrations',
    join(__dirname, '..', '..', '..', '..', 'db', 'migrations'),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `could not locate db/migrations (looked in: ${candidates.join(', ')}). Next: run from the repository root or set MIGRATIONS_DIR to the migrations directory.`,
  );
}

/**
 * Apply every migration in filename order exactly once. The schema_migrations
 * table records what has run, so this is safe to call on every boot.
 */
export async function applyMigrations(pool: Pool, dir = resolveMigrationsDir()): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const done = new Set(rows.map((r) => r.filename));

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `migration ${file} failed: ${(err as Error).message}. Next: inspect that migration and the database log, correct the failing statement, then restart the API.`,
      );
    } finally {
      client.release();
    }
  }
  return applied;
}
