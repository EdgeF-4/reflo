import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  attribute,
  computeCommission,
  allocateByWeight,
  assessConversion,
  type AttributionModel,
  type CommissionRule,
  type PriorConversion,
} from '@reflo/domain';
import { DbService, Querier } from '../db/db.service';
import { QueueService } from '../queue/queue.service';

interface TrackingKeyRow {
  id: string;
  tenant_id: string;
  offer_id: string | null;
  allowed_domains: string[];
  active: boolean;
}

export interface EventInput {
  publicKey: string;
  type: 'click' | 'lead_submit';
  sourceSite: string;
  partnerCode?: string;
  customerRef?: string;
  country?: string;
}

export interface ConversionInput {
  publicKey: string;
  orderId: string;
  amountCents: number;
  customerRef: string;
  sourceSite: string;
  model?: AttributionModel;
  country?: string;
}

function host(site: string): string {
  try {
    return new URL(site.includes('://') ? site : `https://${site}`).hostname.toLowerCase();
  } catch {
    return site.toLowerCase();
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

@Injectable()
export class TrackingService {
  constructor(
    private readonly db: DbService,
    private readonly queue: QueueService,
  ) {}

  /** Resolve and authorise a tracking key. Domain validation happens here so a
   * stolen public key cannot be replayed from an unlisted site. */
  private async authorizeKey(publicKey: string, sourceSite: string): Promise<TrackingKeyRow> {
    const key = await this.db.runAdmin(async (q) => {
      const res = await q.query<TrackingKeyRow>(
        'SELECT id, tenant_id, offer_id, allowed_domains, active FROM tracking_keys WHERE public_key = $1',
        [publicKey],
      );
      return res.rows[0];
    });
    if (!key || !key.active) {
      throw new NotFoundException(
        'unknown or inactive tracking key. Next: copy an active public key from the seeded tracking_keys data and retry.',
      );
    }

    const h = host(sourceSite);
    const allowed = key.allowed_domains.some((d) => h === d.toLowerCase() || h.endsWith(`.${d.toLowerCase()}`));
    if (!allowed) {
      throw new ForbiddenException(
        `source domain "${h}" is not allowed for this key. Next: send the event from a domain in this key's allowed_domains list.`,
      );
    }
    return key;
  }

  /** Upsert a first-party customer identity and return its id. */
  private async upsertCustomer(q: Querier, externalRef: string, country?: string): Promise<string> {
    const fingerprint = sha256(externalRef);
    const res = await q.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, external_ref, fingerprint, country)
       VALUES (reflo_current_tenant(), $1, $2, $3)
       ON CONFLICT (tenant_id, external_ref) DO UPDATE SET country = COALESCE(EXCLUDED.country, customers.country)
       RETURNING id`,
      [externalRef, fingerprint, country ?? null],
    );
    return res.rows[0].id;
  }

  /** Record a click or lead-submit event from the embeddable widget. */
  async recordEvent(input: EventInput): Promise<{ ok: true; eventId: string }> {
    const key = await this.authorizeKey(input.publicKey, input.sourceSite);
    return this.db.runAs({ tenantId: key.tenant_id }, async (q) => {
      const customerId = input.customerRef
        ? await this.upsertCustomer(q, input.customerRef, input.country)
        : null;

      let partnerId: string | null = null;
      if (input.partnerCode) {
        const p = await q.query<{ partner_id: string }>(
          'SELECT partner_id FROM partner_offers WHERE tracking_code = $1',
          [input.partnerCode],
        );
        partnerId = p.rows[0]?.partner_id ?? null;
      }

      const res = await q.query<{ id: string }>(
        `INSERT INTO events (tenant_id, type, partner_id, offer_id, customer_id, tracking_key_id, source_site, country)
         VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [input.type, partnerId, key.offer_id, customerId, key.id, host(input.sourceSite), input.country ?? null],
      );
      return { ok: true as const, eventId: res.rows[0].id };
    });
  }

  /**
   * The conversion pipeline: validate, score for fraud, attribute across the
   * touch journey, compute the commission pool, split it to the exact cent, and
   * accrue an append-only ledger entry per credited partner. A blocked
   * conversion is flagged and never accrues.
   */
  async recordConversion(input: ConversionInput) {
    const key = await this.authorizeKey(input.publicKey, input.sourceSite);
    if (!key.offer_id) {
      throw new BadRequestException(
        'tracking key is not bound to an offer. Next: bind the key to an active offer before recording conversions.',
      );
    }
    const model: AttributionModel = input.model ?? 'position_based';

    const result = await this.db.runAs({ tenantId: key.tenant_id }, async (q) => {
      const customerId = await this.upsertCustomer(q, input.customerRef, input.country);

      // Gather the first-party touch journey for this identity.
      const touchRows = await q.query<{ partner_id: string | null; occurred_at: string }>(
        `SELECT partner_id, occurred_at FROM events
         WHERE tenant_id = reflo_current_tenant() AND customer_id = $1 AND type IN ('click','lead_submit')
         ORDER BY occurred_at ASC`,
        [customerId],
      );
      const touchpoints = touchRows.rows
        .filter((r) => r.partner_id)
        .map((r) => ({ partnerId: r.partner_id as string, at: new Date(r.occurred_at).toISOString() }));

      const conversionAt = new Date().toISOString();
      const primaryPartner = touchpoints[touchpoints.length - 1]?.partnerId ?? null;

      // Recent history in the tenant for velocity and duplicate checks.
      const recent = await q.query<{ conversionId: string; at: string; orderId: string | null }>(
        `SELECT id as "conversionId", occurred_at as at, order_id as "orderId" FROM conversions
         WHERE tenant_id = reflo_current_tenant() AND occurred_at > now() - interval '1 hour'`,
      );
      const recentConversions: PriorConversion[] = recent.rows.map((r) => ({
        conversionId: r.conversionId,
        at: new Date(r.at).toISOString(),
        orderId: r.orderId ?? undefined,
      }));

      const assessment = assessConversion(
        {
          partnerId: primaryPartner ?? 'unknown',
          conversionId: input.orderId,
          orderId: input.orderId,
          customerFingerprint: sha256(input.customerRef),
          conversionAt,
          conversionCountry: input.country,
          amountCents: input.amountCents,
        },
        { recentConversions, now: conversionAt },
      );

      const status = assessment.decision === 'block' ? 'flagged' : 'attributed';
      const conv = await q.query<{ id: string }>(
        `INSERT INTO conversions (tenant_id, offer_id, customer_id, order_id, amount_cents, status, attribution_model)
         VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5, $6) RETURNING id`,
        [key.offer_id, customerId, input.orderId, input.amountCents, status, model],
      );
      const conversionId = conv.rows[0].id;

      await q.query(
        `INSERT INTO fraud_assessments (tenant_id, conversion_id, risk_score, decision, signals, narrative)
         VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5)`,
        [
          conversionId,
          assessment.riskScore,
          assessment.decision,
          JSON.stringify(assessment.signals),
          assessment.signals.length ? `Flagged on: ${assessment.signals.map((s) => s.code).join(', ')}.` : null,
        ],
      );

      const accruedEmpty: Array<{ partnerId: string; amountCents: number; entryId: string }> = [];
      if (assessment.decision === 'block') {
        return { conversionId, status, fraud: assessment, baseCents: 0, accrued: accruedEmpty };
      }

      // Commission pool from the offer's default rule, then the multi-touch split.
      const offer = await q.query<{ default_rule: CommissionRule }>(
        'SELECT default_rule FROM offers WHERE id = $1',
        [key.offer_id],
      );
      const rule = offer.rows[0].default_rule;
      const baseCents = computeCommission(rule, { saleAmountCents: input.amountCents });

      const weights = touchpoints.length
        ? attribute({ touchpoints, conversionAt, model })
        : [];
      const cents = weights.length ? allocateByWeight(baseCents, weights.map((w) => w.weight)) : [];

      const accrued: Array<{ partnerId: string; amountCents: number; entryId: string }> = [];
      for (let i = 0; i < weights.length; i++) {
        const amount = cents[i];
        if (amount <= 0) continue;
        const attr = await q.query<{ id: string }>(
          `INSERT INTO attributions (tenant_id, conversion_id, partner_id, model, weight_bps, amount_cents)
           VALUES (reflo_current_tenant(), $1, $2, $3, $4, $5) RETURNING id`,
          [conversionId, weights[i].partnerId, model, Math.round(weights[i].weight * 10000), amount],
        );
        const entry = await q.query<{ id: string }>(
          `INSERT INTO ledger_entries (tenant_id, partner_id, conversion_id, attribution_id, amount_cents, state)
           VALUES (reflo_current_tenant(), $1, $2, $3, $4, 'pending') RETURNING id`,
          [weights[i].partnerId, conversionId, attr.rows[0].id, amount],
        );
        await q.query(
          `INSERT INTO ledger_events (tenant_id, entry_id, seq, type, amount_cents, actor)
           VALUES (reflo_current_tenant(), $1, 1, 'accrued', $2, 'tracking-pipeline')`,
          [entry.rows[0].id, amount],
        );
        accrued.push({ partnerId: weights[i].partnerId, amountCents: amount, entryId: entry.rows[0].id });
      }

      return { conversionId, status, fraud: assessment, baseCents, accrued };
    });

    // Schedule the hold-window auto-confirm for each accrued entry, now that the
    // transaction has committed and the entries are durable.
    for (const entry of result.accrued) {
      await this.queue.enqueueAutoConfirm(key.tenant_id, entry.entryId);
    }
    return result;
  }
}
