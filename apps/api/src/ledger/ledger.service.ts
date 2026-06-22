import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  foldEntry,
  nextState,
  type LedgerEvent,
  type LedgerEventType,
  type LedgerState,
} from '@reflo/domain';
import { DbService, Querier } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext } from '../auth/auth-context';
import { scopeFor } from '../auth/current-user';

@Injectable()
export class LedgerService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listEntries(auth: AuthContext, state?: LedgerState) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const sql = `
        SELECT le.*, p.name AS partner_name, c.order_id
        FROM ledger_entries le
        JOIN partners p ON p.id = le.partner_id
        JOIN conversions c ON c.id = le.conversion_id
        ${state ? 'WHERE le.state = $1' : ''}
        ORDER BY le.created_at DESC`;
      return (await q.query(sql, state ? [state] : [])).rows;
    });
  }

  async history(auth: AuthContext, entryId: string) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const entry = await q.query('SELECT * FROM ledger_entries WHERE id = $1', [entryId]);
      if (!entry.rowCount) throw new NotFoundException('ledger entry not found');
      const events = await q.query(
        'SELECT * FROM ledger_events WHERE entry_id = $1 ORDER BY seq ASC',
        [entryId],
      );
      return { entry: entry.rows[0], events: events.rows };
    });
  }

  /** Append a transition event after validating it against the state machine. */
  async transition(auth: AuthContext, entryId: string, type: LedgerEventType, reason?: string) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const view = await this.loadView(q, entryId);
      if (!nextState(view.state, type)) {
        throw new BadRequestException(`cannot apply "${type}" while in state "${view.state}"`);
      }
      const updated = await this.append(q, entryId, type, reason, auth.email);
      await this.audit.record(q, auth, {
        action: `ledger.${type}`,
        entityType: 'ledger_entry',
        entityId: entryId,
        before: { state: view.state },
        after: { state: updated },
      });
      return { entryId, state: updated };
    });
  }

  /** Pay every payable entry in scope and group the results into payout batches. */
  async runPayouts(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const payable = await q.query<{ id: string; partner_id: string; amount_cents: string }>(
        "SELECT id, partner_id, amount_cents FROM ledger_entries WHERE state = 'payable'",
      );
      const byPartner = new Map<string, number>();
      for (const row of payable.rows) {
        await this.append(q, row.id, 'paid', 'batch payout', auth.email);
        byPartner.set(row.partner_id, (byPartner.get(row.partner_id) ?? 0) + Number(row.amount_cents));
      }
      const batches = [];
      for (const [partnerId, amount] of byPartner) {
        const res = await q.query(
          `INSERT INTO payouts (tenant_id, partner_id, amount_cents, status)
           VALUES (reflo_current_tenant(), $1, $2, 'paid') RETURNING *`,
          [partnerId, amount],
        );
        batches.push(res.rows[0]);
      }
      await this.audit.record(q, auth, { action: 'payout.run', entityType: 'tenant', after: { entries: payable.rowCount, batches: batches.length } });
      return { paidEntries: payable.rowCount, batches };
    });
  }

  /**
   * Advance an entry as a background system actor (used by the queue worker).
   * Skips silently if the transition is no longer legal, so a retried job is safe.
   */
  async systemTransition(tenantId: string, entryId: string, type: LedgerEventType) {
    return this.db.runAs({ tenantId }, async (q) => {
      const view = await this.loadView(q, entryId);
      if (!nextState(view.state, type)) return { entryId, state: view.state, skipped: true };
      const updated = await this.append(q, entryId, type, 'auto', 'scheduler');
      return { entryId, state: updated, skipped: false };
    });
  }

  /** Load and fold an entry's event stream to know its authoritative state. */
  private async loadView(q: Querier, entryId: string) {
    const entry = await q.query('SELECT id FROM ledger_entries WHERE id = $1', [entryId]);
    if (!entry.rowCount) throw new NotFoundException('ledger entry not found');
    const events = await q.query<{ seq: number; type: LedgerEvent['type']; amountCents: string | null; at: string }>(
      'SELECT seq, type, amount_cents AS "amountCents", occurred_at AS at FROM ledger_events WHERE entry_id = $1 ORDER BY seq ASC',
      [entryId],
    );
    // bigint columns arrive as strings from node-postgres; coerce to integers
    // so the domain fold sees real cents, not text.
    return foldEntry(
      events.rows.map((e) => ({
        seq: Number(e.seq),
        type: e.type,
        amountCents: e.amountCents == null ? undefined : Number(e.amountCents),
        at: new Date(e.at).toISOString(),
      })),
    );
  }

  /** Append the next event in the stream and sync the entry projection. */
  private async append(q: Querier, entryId: string, type: LedgerEventType, reason: string | undefined, actor: string) {
    const max = await q.query<{ max: number | null }>(
      'SELECT MAX(seq) AS max FROM ledger_events WHERE entry_id = $1',
      [entryId],
    );
    const seq = (max.rows[0].max ?? 0) + 1;
    await q.query(
      `INSERT INTO ledger_events (tenant_id, entry_id, seq, type, actor, reason)
       VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5)`,
      [entryId, seq, type, actor, reason ?? null],
    );
    // Recompute the projected state from the full stream so it can never drift.
    const view = await this.loadView(q, entryId);
    await q.query('UPDATE ledger_entries SET state = $1, updated_at = now() WHERE id = $2', [
      view.state,
      entryId,
    ]);
    return view.state as LedgerState;
  }
}
