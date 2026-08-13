import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { applyMigrations } from './db/migrate';
import { seedDemo } from './db/seed';
import { ActionableExceptionFilter } from './core/actionable-exception.filter';
import { closeStartupPool, failStartupAndClose } from './startup-boundaries';

async function bootstrap() {
  const cfg = loadConfig();
  const logger = new Logger('bootstrap');

  // Run migrations and seed before serving, so a single `docker compose up`
  // yields a working, populated demo with no extra commands.
  if (cfg.runMigrations || cfg.runSeed) {
    const adminPool = new Pool({ connectionString: cfg.adminDatabaseUrl });
    let preparationError: unknown;
    try {
      if (cfg.runMigrations) {
        const applied = await applyMigrations(adminPool);
        logger.log(applied.length ? `migrations applied: ${applied.join(', ')}` : 'migrations up to date');
      }
      if (cfg.runSeed) {
        const { seeded } = await seedDemo(adminPool);
        logger.log(seeded ? 'demo data seeded' : 'demo data already present');
      }
    } catch (err) {
      preparationError = err;
      throw err;
    } finally {
      await closeStartupPool(adminPool, preparationError);
    }
  }

  let app;
  try {
    app = await NestFactory.create(AppModule, { cors: true });
  } catch (err) {
    throw new Error(
      `could not create the API application: ${(err as Error).message}. Next: inspect the dependency named by this cause, correct its configuration, then restart the stack.`,
    );
  }
  try {
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ActionableExceptionFilter());
    await app.listen(cfg.port, '0.0.0.0');
  } catch (err) {
    await failStartupAndClose(app, err, cfg.port);
  }
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
