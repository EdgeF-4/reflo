/** Central configuration, read once from the environment. */
export interface AppConfig {
  port: number;
  jwtSecret: string;
  jwtTtlSeconds: number;
  /** Connection string for the unprivileged runtime role (RLS enforced). */
  databaseUrl: string;
  /** Connection string for the superuser, used only for migrations and seeding. */
  adminDatabaseUrl: string;
  redisUrl?: string;
  runMigrations: boolean;
  runSeed: boolean;
  startWorker: boolean;
  /** Path to the optional AI provider config (chmod 600), never committed. */
  aiConfigPath: string;
}

export function loadConfig(): AppConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 4000),
    jwtSecret: env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
    jwtTtlSeconds: Number(env.JWT_TTL_SECONDS ?? 60 * 60 * 12),
    databaseUrl:
      env.DATABASE_URL ?? 'postgres://reflo_app:reflo_app_pw@localhost:5432/reflo',
    adminDatabaseUrl:
      env.ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/reflo',
    redisUrl: env.REDIS_URL,
    runMigrations: env.RUN_MIGRATIONS !== 'false',
    runSeed: env.RUN_SEED !== 'false',
    startWorker: env.START_WORKER !== 'false',
    aiConfigPath: env.AI_CONFIG_PATH ?? '/app/config.json',
  };
}
