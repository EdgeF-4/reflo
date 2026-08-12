import { Pool } from 'pg';
import { loadConfig } from '../config';
import { applyMigrations } from './migrate';
import { seedDemo } from './seed';

/** Standalone migrate/seed entrypoint: `node dist/db/cli.js migrate|seed`. */
async function main() {
  const cmd = process.argv[2];
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.adminDatabaseUrl });
  try {
    if (cmd === 'migrate') {
      const applied = await applyMigrations(pool);
      console.log(applied.length ? `applied: ${applied.join(', ')}` : 'no pending migrations');
    } else if (cmd === 'seed') {
      const { seeded } = await seedDemo(pool);
      console.log(seeded ? 'demo data seeded' : 'demo data already present, skipped');
    } else {
      console.error(
        'usage: cli.js <migrate|seed>. Next: choose `migrate` to apply schema changes or `seed` to load the demo.',
      );
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    'database command failed. Next: verify ADMIN_DATABASE_URL and database health, then retry the same command.',
    err,
  );
  process.exit(1);
});
