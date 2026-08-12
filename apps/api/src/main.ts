import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { applyMigrations } from './db/migrate';
import { seedDemo } from './db/seed';
import { ActionableExceptionFilter } from './core/actionable-exception.filter';

async function bootstrap() {
  const cfg = loadConfig();
  const logger = new Logger('bootstrap');

  // Run migrations and seed before serving, so a single `docker compose up`
  // yields a working, populated demo with no extra commands.
  if (cfg.runMigrations || cfg.runSeed) {
    const adminPool = new Pool({ connectionString: cfg.adminDatabaseUrl });
    try {
      if (cfg.runMigrations) {
        const applied = await applyMigrations(adminPool);
        logger.log(applied.length ? `migrations applied: ${applied.join(', ')}` : 'migrations up to date');
      }
      if (cfg.runSeed) {
        const { seeded } = await seedDemo(adminPool);
        logger.log(seeded ? 'demo data seeded' : 'demo data already present');
      }
    } finally {
      await adminPool.end();
    }
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ActionableExceptionFilter());
  await app.listen(cfg.port, '0.0.0.0');
  logger.log(`Reflo API listening on :${cfg.port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    'failed to start API. Next: run `docker compose ps` and `docker compose logs db redis`, fix the unavailable dependency, then restart the stack.',
    err,
  );
  process.exit(1);
});
