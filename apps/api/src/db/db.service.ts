import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config';

/** A minimal query interface so callers do not depend on the pg client shape. */
export interface Querier {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

/** The tenant and (optional) partner scope a unit of work runs under. */
export interface DbScope {
  tenantId: string;
  partnerId?: string | null;
}

/**
 * Owns the connection pools and is the single place that binds a unit of work
 * to a tenant. `runAs` opens a transaction, sets the RLS session variables with
 * set_config(..., true) so they are scoped to that transaction only, and runs
 * the callback against a connection that the database will filter by tenant.
 *
 * The admin pool connects as the superuser and is used only for migrations,
 * seeding, and the few authentication lookups that must happen before a tenant
 * context exists (resolving a user or a tracking key). Everything else flows
 * through `runAs` and is therefore subject to row-level security.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly appPool: Pool;
  private readonly adminPool: Pool;

  constructor() {
    const cfg = loadConfig();
    this.appPool = new Pool({ connectionString: cfg.databaseUrl, max: 10 });
    this.adminPool = new Pool({ connectionString: cfg.adminDatabaseUrl, max: 4 });
  }

  /** Run work inside a tenant-scoped transaction as the unprivileged role. */
  async runAs<T>(scope: DbScope, work: (q: Querier) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['reflo.tenant_id', scope.tenantId]);
      await client.query('SELECT set_config($1, $2, true)', [
        'reflo.partner_id',
        scope.partnerId ?? '',
      ]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Run work as the superuser. Use only for migrations, seeding, and auth lookups. */
  async runAdmin<T>(work: (q: Querier) => Promise<T>): Promise<T> {
    const client = await this.adminPool.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  /** Direct access to the admin pool for bulk scripts (migrations, seed). */
  get admin(): Pool {
    return this.adminPool;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.appPool.end(), this.adminPool.end()]);
  }
}
