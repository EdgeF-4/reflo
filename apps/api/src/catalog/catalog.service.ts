import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext } from '../auth/auth-context';
import { scopeFor } from '../auth/current-user';
import type { CommissionRule } from '@reflo/domain';

/** Lightweight validation that a stored rule body is one of the known shapes. */
function assertRule(rule: CommissionRule): void {
  const kinds = ['percentage', 'flat', 'tiered', 'recurring'];
  if (!rule || !kinds.includes((rule as { type: string }).type)) {
    throw new BadRequestException(
      'commission rule must be percentage, flat, tiered or recurring. Next: set rule.type to one of those four values and provide its required fields.',
    );
  }
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listOffers(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) =>
      (await q.query('SELECT * FROM offers ORDER BY created_at DESC')).rows,
    );
  }

  createOffer(auth: AuthContext, body: { name: string; description?: string; destinationUrl: string; defaultRule: CommissionRule }) {
    assertRule(body.defaultRule);
    return this.db.runAs(scopeFor(auth), async (q) => {
      const res = await q.query<{ id: string }>(
        `INSERT INTO offers (tenant_id, name, description, destination_url, default_rule)
         VALUES (reflo_current_tenant(), $1, $2, $3, $4) RETURNING *`,
        [body.name, body.description ?? '', body.destinationUrl, JSON.stringify(body.defaultRule)],
      );
      await this.audit.record(q, auth, { action: 'offer.created', entityType: 'offer', entityId: res.rows[0].id, after: body });
      return res.rows[0];
    });
  }

  listPartners(auth: AuthContext) {
    return this.db.runAs(scopeFor(auth), async (q) =>
      (await q.query('SELECT * FROM partners ORDER BY created_at DESC')).rows,
    );
  }

  createPartner(auth: AuthContext, body: { name: string; email: string }) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const res = await q.query(
        `INSERT INTO partners (tenant_id, name, email) VALUES (reflo_current_tenant(), $1, $2) RETURNING *`,
        [body.name, body.email],
      );
      await this.audit.record(q, auth, { action: 'partner.created', entityType: 'partner', entityId: res.rows[0].id, after: body });
      return res.rows[0];
    });
  }

  listRules(auth: AuthContext, offerId?: string) {
    return this.db.runAs(scopeFor(auth), async (q) => {
      const sql = offerId
        ? 'SELECT * FROM commission_rules WHERE offer_id = $1 ORDER BY priority DESC'
        : 'SELECT * FROM commission_rules ORDER BY priority DESC';
      return (await q.query(sql, offerId ? [offerId] : [])).rows;
    });
  }

  createRule(auth: AuthContext, body: { offerId: string; partnerId?: string; rule: CommissionRule; priority?: number }) {
    assertRule(body.rule);
    return this.db.runAs(scopeFor(auth), async (q) => {
      const res = await q.query(
        `INSERT INTO commission_rules (tenant_id, offer_id, partner_id, rule, priority)
         VALUES (reflo_current_tenant(), $1, $2, $3, $4) RETURNING *`,
        [body.offerId, body.partnerId ?? null, JSON.stringify(body.rule), body.priority ?? 0],
      );
      await this.audit.record(q, auth, { action: 'commission_rule.created', entityType: 'offer', entityId: body.offerId, after: body });
      return res.rows[0];
    });
  }
}
