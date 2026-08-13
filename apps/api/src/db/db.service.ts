import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config';
import { cleanupFailures, releaseDatabaseClient } from './failure-boundaries';

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
    let operationError: unknown;
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
      operationError = err;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        operationError = new Error(
          `tenant transaction failed: ${(err as Error).message}; rollback also failed: ${(rollbackError as Error).message}. Next: inspect the database log, restore database health, then retry only after confirming the transaction state.`,
        );
        throw operationError;
      }
      throw err;
    } finally {
      releaseDatabaseClient(client, 'tenant transaction', operationError);
    }
  }

  /** Run work as the superuser. Use only for migrations, seeding, and auth lookups. */
  async runAdmin<T>(work: (q: Querier) => Promise<T>): Promise<T> {
    const client = await this.adminPool.connect();
    let operationError: unknown;
    try {
      return await work(client);
    } catch (err) {
      operationError = err;
      throw err;
    } finally {
      releaseDatabaseClient(client, 'admin operation', operationError);
    }
  }

  /** Direct access to the admin pool for bulk scripts (migrations, seed). */
  get admin(): Pool {
    return this.adminPool;
  }

  async onModuleDestroy(): Promise<void> {
    const failed = await cleanupFailures([
      { name: 'application pool', run: () => this.appPool.end() },
      { name: 'admin pool', run: () => this.adminPool.end() },
    ]);
    if (failed.length) {
      throw new Error(
        `database pool shutdown failed: ${failed.join('; ')}. Next: stop new requests, inspect active database clients, then retry shutdown.`,
      );
    }
  }
}
