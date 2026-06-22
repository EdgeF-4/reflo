import { Injectable } from '@nestjs/common';
import { Querier } from '../db/db.service';
import { AuthContext } from '../auth/auth-context';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Writes immutable audit rows. The caller passes the same transaction-bound
 * querier used for the action itself, so the audit entry commits atomically
 * with the change it records (or not at all).
 */
@Injectable()
export class AuditService {
  async record(q: Querier, actor: Pick<AuthContext, 'userId' | 'role'>, input: AuditInput): Promise<void> {
    await q.query(
      `INSERT INTO audit_log (tenant_id, actor_id, actor_role, action, entity_type, entity_id, before, after, ip)
       VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor.userId,
        actor.role,
        input.action,
        input.entityType,
        input.entityId ?? null,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.ip ?? null,
      ],
    );
  }
}
