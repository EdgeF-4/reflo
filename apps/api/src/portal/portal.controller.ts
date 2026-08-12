import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { formatCents } from '@reflo/domain';
import { DbService } from '../db/db.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser } from '../auth/current-user';
import { AuthContext } from '../auth/auth-context';
import { scopeFor } from '../auth/current-user';

/**
 * Partner-facing portal. Every query runs with the partner scope set, so
 * row-level security guarantees a partner can only ever read its own data, even
 * if a query forgot to filter.
 */
@Controller('portal')
@UseGuards(JwtGuard, RolesGuard)
@Roles('partner')
export class PortalController {
  constructor(private readonly db: DbService) {}

  private guard(user: AuthContext) {
    if (user.role !== 'partner' || !user.partnerId) {
      throw new ForbiddenException(
        'partner account required. Next: sign in with the seeded partner account before using portal routes.',
      );
    }
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthContext) {
    this.guard(user);
    return this.db.runAs(scopeFor(user), async (q) => {
      const rows = await q.query<{ state: string; total: string; n: string }>(
        'SELECT state, SUM(amount_cents) AS total, COUNT(*) AS n FROM ledger_entries GROUP BY state',
      );
      const buckets: Record<string, number> = {
        pending: 0, confirmed: 0, payable: 0, paid: 0, reversed: 0, clawed_back: 0,
      };
      for (const r of rows.rows) buckets[r.state] = Number(r.total);
      const conv = await q.query<{ n: string }>('SELECT COUNT(DISTINCT conversion_id) AS n FROM ledger_entries');
      return {
        owedCents: buckets.pending + buckets.confirmed + buckets.payable,
        payableCents: buckets.payable,
        paidCents: buckets.paid,
        pendingCents: buckets.pending,
        conversions: Number(conv.rows[0].n),
        owedDisplay: formatCents(buckets.pending + buckets.confirmed + buckets.payable),
        paidDisplay: formatCents(buckets.paid),
      };
    });
  }

  @Get('ledger')
  ledger(@CurrentUser() user: AuthContext) {
    this.guard(user);
    return this.db.runAs(scopeFor(user), async (q) =>
      (
        await q.query(
          `SELECT le.id, le.amount_cents, le.state, le.created_at, c.order_id
           FROM ledger_entries le JOIN conversions c ON c.id = le.conversion_id
           ORDER BY le.created_at DESC`,
        )
      ).rows,
    );
  }

  @Get('offers')
  offers(@CurrentUser() user: AuthContext) {
    this.guard(user);
    return this.db.runAs(scopeFor(user), async (q) =>
      (
        await q.query(
          `SELECT po.tracking_code, po.approved, o.name, o.destination_url, o.default_rule
           FROM partner_offers po JOIN offers o ON o.id = po.offer_id
           ORDER BY o.name`,
        )
      ).rows,
    );
  }
}
