import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthContext } from '../auth/auth-context';
import { scopeFor } from '../auth/current-user';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService) {}

  /** Program-level KPIs for the admin dashboard. */
  summary(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const ledger = await q.query<{ state: string; total: string; n: string }>(
        'SELECT state, SUM(amount_cents) AS total, COUNT(*) AS n FROM ledger_entries GROUP BY state',
      );
      const buckets: Record<string, number> = {
        pending: 0, confirmed: 0, payable: 0, paid: 0, reversed: 0, clawed_back: 0,
      };
      for (const r of ledger.rows) buckets[r.state] = Number(r.total);

      const conv = await q.query<{ total: string; flagged: string }>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'flagged') AS flagged FROM conversions`,
      );
      const counts = await q.query<{ partners: string; offers: string; events: string }>(
        `SELECT
           (SELECT COUNT(*) FROM partners) AS partners,
           (SELECT COUNT(*) FROM offers) AS offers,
           (SELECT COUNT(*) FROM events) AS events`,
      );

      const owed = buckets.pending + buckets.confirmed + buckets.payable;
      return {
        ledger: buckets,
        owedCents: owed,
        paidCents: buckets.paid,
        payableCents: buckets.payable,
        conversions: Number(conv.rows[0].total),
        flaggedConversions: Number(conv.rows[0].flagged),
        partners: Number(counts.rows[0].partners),
        offers: Number(counts.rows[0].offers),
        events: Number(counts.rows[0].events),
      };
    });
  }

  /** Per-partner earnings leaderboard. */
  partners(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) =>
      (
        await q.query(
          `SELECT p.id, p.name, p.status,
             COALESCE(SUM(le.amount_cents) FILTER (WHERE le.state IN ('pending','confirmed','payable')), 0)::bigint AS owed_cents,
             COALESCE(SUM(le.amount_cents) FILTER (WHERE le.state = 'paid'), 0)::bigint AS paid_cents,
             COUNT(DISTINCT le.conversion_id) AS conversions
           FROM partners p
           LEFT JOIN ledger_entries le ON le.partner_id = p.id
           GROUP BY p.id, p.name, p.status
           ORDER BY paid_cents DESC, owed_cents DESC`,
        )
      ).rows,
    );
  }

  fraud(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) =>
      (
        await q.query(
          `SELECT fa.*, c.order_id, c.amount_cents
           FROM fraud_assessments fa JOIN conversions c ON c.id = fa.conversion_id
           ORDER BY fa.risk_score DESC, fa.created_at DESC LIMIT 100`,
        )
      ).rows,
    );
  }

  audit(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) =>
      (await q.query('SELECT * FROM audit_log ORDER BY occurred_at DESC LIMIT 200')).rows,
    );
  }
}
