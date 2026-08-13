import { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  attribute,
  computeCommission,
  allocateByWeight,
  assessConversion,
  type AttributionModel,
  type CommissionRule,
  type LedgerState,
  type PriorConversion,
} from '@reflo/domain';
import { releaseDatabaseClient } from './failure-boundaries';

const TENANT_SLUG = 'northwind';
const DEMO_PASSWORD = 'demo1234';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function iso(daysAgo: number, extraMs = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000 + extraMs).toISOString();
}

/**
 * Build the full demo program. Idempotent: if the demo tenant already exists we
 * leave the database untouched. Every monetary figure here is produced by the
 * @reflo/domain functions, so the seeded ledger is internally consistent with
 * the attribution and commission logic the running API uses.
 */
export async function seedDemo(pool: Pool): Promise<{ seeded: boolean }> {
  const exists = await pool.query('SELECT 1 FROM tenants WHERE slug = $1', [TENANT_SLUG]);
  if (exists.rowCount && exists.rowCount > 0) {
    return { seeded: false };
  }

  const client = await pool.connect();
  let operationError: unknown;
  try {
    await client.query('BEGIN');
    await build(client);
    await client.query('COMMIT');
    return { seeded: true };
  } catch (err) {
    operationError = err;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      operationError = new Error(
        `demo seed failed: ${(err as Error).message}; rollback also failed: ${(rollbackError as Error).message}. Next: inspect the database log, restore database health, then rerun the seed only after confirming the transaction state.`,
      );
      throw operationError;
    }
    operationError = new Error(
      `demo seed failed: ${(err as Error).message}. Next: inspect the failing seed statement and database log, correct the cause, then restart the API.`,
    );
    throw operationError;
  } finally {
    releaseDatabaseClient(client, 'demo seed', operationError);
  }
}

async function build(c: PoolClient): Promise<void> {
  const pwHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const tenantId = (
    await c.query<{ id: string }>(
      'INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id',
      [TENANT_SLUG, 'Northwind'],
    )
  ).rows[0].id;

  // Partners. Quick Clicks Media is the bad actor used for the fraud demo.
  const partnerDefs = [
    { key: 'creator', name: 'Creator Collective', email: 'team@creatorcollective.test' },
    { key: 'devtools', name: 'DevTools Weekly', email: 'hello@devtoolsweekly.test' },
    { key: 'mavens', name: 'SaaS Mavens', email: 'partners@saasmavens.test' },
    { key: 'growth', name: 'Growth Pods', email: 'go@growthpods.test' },
    { key: 'quick', name: 'Quick Clicks Media', email: 'ops@quickclicks.test' },
  ];
  const partners: Record<string, string> = {};
  for (const p of partnerDefs) {
    partners[p.key] = (
      await c.query<{ id: string }>(
        'INSERT INTO partners (tenant_id, name, email) VALUES ($1, $2, $3) RETURNING id',
        [tenantId, p.name, p.email],
      )
    ).rows[0].id;
  }

  // Users: the program team plus a partner login wired to Creator Collective.
  const userDefs = [
    { email: 'owner@northwind.test', name: 'Dana Owner', role: 'owner', partner: null },
    { email: 'admin@northwind.test', name: 'Alex Admin', role: 'admin', partner: null },
    { email: 'analyst@northwind.test', name: 'Robin Analyst', role: 'analyst', partner: null },
    { email: 'partner@northwind.test', name: 'Casey Creator', role: 'partner', partner: 'creator' },
  ];
  for (const u of userDefs) {
    await c.query(
      'INSERT INTO users (tenant_id, email, password_hash, name, role, partner_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, u.email, pwHash, u.name, u.role, u.partner ? partners[u.partner] : null],
    );
  }

  // Offers with their default commission rule.
  const proRule: CommissionRule = { type: 'percentage', rateBps: 2000 };
  const annualRule: CommissionRule = {
    type: 'tiered',
    tiers: [
      { minSaleCents: 0, rateBps: 1500 },
      { minSaleCents: 10000, rateBps: 2000 },
      { minSaleCents: 50000, rateBps: 2500 },
    ],
  };
  const newsletterRule: CommissionRule = { type: 'flat', amountCents: 500 };

  const offerDefs = [
    { key: 'pro', name: 'Pro Plan Referral', url: 'https://northwind.example/pricing', rule: proRule },
    { key: 'annual', name: 'Annual Upgrade', url: 'https://northwind.example/annual', rule: annualRule },
    { key: 'news', name: 'Newsletter Signup', url: 'https://northwind.example/newsletter', rule: newsletterRule },
  ];
  const offers: Record<string, { id: string; rule: CommissionRule }> = {};
  for (const o of offerDefs) {
    const id = (
      await c.query<{ id: string }>(
        'INSERT INTO offers (tenant_id, name, description, destination_url, status, default_rule) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [tenantId, o.name, `Promote ${o.name}.`, o.url, 'active', JSON.stringify(o.rule)],
      )
    ).rows[0].id;
    offers[o.key] = { id, rule: o.rule };
  }

  // A partner-specific override: Creator Collective earns a richer rate on Pro.
  await c.query(
    'INSERT INTO commission_rules (tenant_id, offer_id, partner_id, rule, priority) VALUES ($1,$2,$3,$4,$5)',
    [tenantId, offers.pro.id, partners.creator, JSON.stringify({ type: 'percentage', rateBps: 2500 }), 10],
  );

  // Tracking keys (one per offer) with the source sites each accepts events from.
  const trackingKeys: Record<string, string> = {};
  const keyDefs = [
    { key: 'pro', pub: 'pk_live_pro_8f2a', domains: ['creatorcollective.test', 'devtoolsweekly.test', 'saasmavens.test'] },
    { key: 'annual', pub: 'pk_live_annual_3c71', domains: ['growthpods.test', 'saasmavens.test'] },
    { key: 'news', pub: 'pk_live_news_5d90', domains: ['creatorcollective.test', 'quickclicks.test'] },
  ];
  for (const k of keyDefs) {
    trackingKeys[k.key] = (
      await c.query<{ id: string }>(
        'INSERT INTO tracking_keys (tenant_id, offer_id, public_key, secret_hash, allowed_domains) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [tenantId, offers[k.key].id, k.pub, sha256(`secret_${k.key}`), k.domains],
      )
    ).rows[0].id;
  }

  // Approve partners on offers with a unique tracking code each.
  const approvals: Array<[string, string]> = [
    ['creator', 'pro'], ['creator', 'news'], ['devtools', 'pro'],
    ['mavens', 'pro'], ['mavens', 'annual'], ['growth', 'annual'], ['quick', 'news'],
  ];
  for (const [pk, ok] of approvals) {
    await c.query(
      'INSERT INTO partner_offers (tenant_id, partner_id, offer_id, tracking_code) VALUES ($1,$2,$3,$4)',
      [tenantId, partners[pk], offers[ok].id, `${pk}-${ok}`],
    );
  }

  // The conversion scenarios. Each lists its touch journey (partner + days ago),
  // sale size, attribution model, the ledger state to settle into, and an
  // optional fraud flavour. Money is computed, never hand-written.
  type Scenario = {
    offer: string;
    sale: number;
    model: AttributionModel;
    touches: Array<{ partner: string; daysAgo: number }>;
    daysAgo: number;
    state: LedgerState;
    order: string;
    clickCountry?: string;
    convCountry?: string;
    dwellMs?: number;
    fraud?: 'duplicate' | 'velocity' | 'geo';
    /** Order id the partner *claims* (used to trip duplicate detection). */
    claimOrderId?: string;
  };

  const scenarios: Scenario[] = [
    { offer: 'pro', sale: 9900, model: 'linear', daysAgo: 41, state: 'paid', order: 'NW-1001',
      touches: [{ partner: 'devtools', daysAgo: 44 }, { partner: 'creator', daysAgo: 42 }] },
    { offer: 'pro', sale: 19900, model: 'position_based', daysAgo: 38, state: 'paid', order: 'NW-1002',
      touches: [{ partner: 'mavens', daysAgo: 45 }, { partner: 'devtools', daysAgo: 40 }, { partner: 'creator', daysAgo: 39 }] },
    { offer: 'annual', sale: 120000, model: 'time_decay', daysAgo: 35, state: 'paid', order: 'NW-1003',
      touches: [{ partner: 'growth', daysAgo: 50 }, { partner: 'mavens', daysAgo: 36 }] },
    { offer: 'news', sale: 0, model: 'last_touch', daysAgo: 33, state: 'paid', order: 'NW-1004',
      touches: [{ partner: 'creator', daysAgo: 33 }] },
    { offer: 'pro', sale: 9900, model: 'linear', daysAgo: 26, state: 'payable', order: 'NW-1005',
      touches: [{ partner: 'creator', daysAgo: 28 }, { partner: 'mavens', daysAgo: 27 }] },
    { offer: 'annual', sale: 60000, model: 'first_touch', daysAgo: 24, state: 'payable', order: 'NW-1006',
      touches: [{ partner: 'growth', daysAgo: 30 }, { partner: 'mavens', daysAgo: 25 }] },
    { offer: 'pro', sale: 14900, model: 'position_based', daysAgo: 19, state: 'confirmed', order: 'NW-1007',
      touches: [{ partner: 'devtools', daysAgo: 22 }, { partner: 'creator', daysAgo: 21 }, { partner: 'mavens', daysAgo: 20 }] },
    { offer: 'news', sale: 0, model: 'last_touch', daysAgo: 16, state: 'confirmed', order: 'NW-1008',
      touches: [{ partner: 'creator', daysAgo: 16 }] },
    { offer: 'pro', sale: 9900, model: 'linear', daysAgo: 9, state: 'pending', order: 'NW-1009',
      touches: [{ partner: 'mavens', daysAgo: 11 }, { partner: 'devtools', daysAgo: 10 }] },
    { offer: 'annual', sale: 30000, model: 'time_decay', daysAgo: 6, state: 'pending', order: 'NW-1010',
      touches: [{ partner: 'growth', daysAgo: 8 }, { partner: 'mavens', daysAgo: 7 }] },
    // A refund after payout: settled, paid, then clawed back.
    { offer: 'pro', sale: 9900, model: 'last_touch', daysAgo: 30, state: 'clawed_back', order: 'NW-1011',
      touches: [{ partner: 'devtools', daysAgo: 31 }] },
    // Cancelled before payout: reversed.
    { offer: 'annual', sale: 45000, model: 'last_touch', daysAgo: 14, state: 'reversed', order: 'NW-1012',
      touches: [{ partner: 'growth', daysAgo: 15 }] },
    // Fraud: geo mismatch plus a sub-second dwell from Quick Clicks (review).
    { offer: 'news', sale: 0, model: 'last_touch', daysAgo: 4, state: 'pending', order: 'NW-1013',
      touches: [{ partner: 'quick', daysAgo: 4 }], fraud: 'geo', clickCountry: 'NG', convCountry: 'US', dwellMs: 800 },
    // Fraud: Quick Clicks re-claims an order it already submitted, from a proxy,
    // in under a second. Duplicate + geo + low dwell stack to a hard block.
    { offer: 'news', sale: 0, model: 'last_touch', daysAgo: 3, state: 'pending', order: 'NW-DUP1',
      touches: [{ partner: 'quick', daysAgo: 3 }], fraud: 'duplicate', claimOrderId: 'NW-1013',
      clickCountry: 'NG', convCountry: 'US', dwellMs: 600 },
  ];

  // Fraud velocity burst: ten newsletter conversions from Quick Clicks in seconds.
  for (let i = 0; i < 10; i++) {
    scenarios.push({
      offer: 'news', sale: 0, model: 'last_touch', daysAgo: 2, state: 'pending',
      order: `NW-V${i}`, touches: [{ partner: 'quick', daysAgo: 2 }], fraud: 'velocity',
    });
  }

  const recentByPartner: Record<string, PriorConversion[]> = {};
  let velocityClock = 0;

  for (const s of scenarios) {
    const offer = offers[s.offer];
    const primaryPartnerKey = s.touches[s.touches.length - 1].partner;
    const primaryPartner = partners[primaryPartnerKey];

    // First-party customer identity.
    const fingerprint = sha256(`${s.order}-${primaryPartnerKey}`);
    const customerId = (
      await c.query<{ id: string }>(
        'INSERT INTO customers (tenant_id, external_ref, email_hash, fingerprint, country) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [tenantId, `cust-${s.order}`, sha256(`${s.order}@buyer`), fingerprint, s.convCountry ?? 'US'],
      )
    ).rows[0].id;

    // Record each touch as a click event.
    const touchpoints = [];
    for (const t of s.touches) {
      await c.query(
        'INSERT INTO events (tenant_id, type, partner_id, offer_id, customer_id, tracking_key_id, source_site, country, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [tenantId, 'click', partners[t.partner], offer.id, customerId, trackingKeys[s.offer] ?? null,
          `${t.partner}.test`, s.clickCountry ?? 'US', iso(t.daysAgo)],
      );
      touchpoints.push({ partnerId: partners[t.partner], at: iso(t.daysAgo) });
    }

    // Fraud assessment against the primary partner's recent history.
    const isVelocity = s.fraud === 'velocity';
    const convAtMs = isVelocity ? velocityClock++ * 4_000 : 0;
    const conversionAt = iso(s.daysAgo, convAtMs);
    const assessment = assessConversion(
      {
        partnerId: primaryPartner,
        conversionId: s.order,
        orderId: s.claimOrderId ?? s.order,
        customerFingerprint: fingerprint,
        clickAt: s.dwellMs ? iso(s.daysAgo, convAtMs - s.dwellMs) : iso(s.touches[s.touches.length - 1].daysAgo),
        conversionAt,
        clickCountry: s.clickCountry,
        conversionCountry: s.convCountry,
        amountCents: s.sale,
      },
      { recentConversions: recentByPartner[primaryPartner] ?? [], now: conversionAt },
    );

    const status = assessment.decision === 'block' ? 'flagged' : 'attributed';
    const conversionId = (
      await c.query<{ id: string }>(
        `INSERT INTO conversions (tenant_id, offer_id, customer_id, order_id, amount_cents, status, attribution_model, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, offer.id, customerId, s.order + (isVelocity ? `-${velocityClock}` : ''), s.sale, status, s.model, conversionAt],
      )
    ).rows[0].id;

    await c.query(
      'INSERT INTO fraud_assessments (tenant_id, conversion_id, risk_score, decision, signals, narrative) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, conversionId, assessment.riskScore, assessment.decision, JSON.stringify(assessment.signals),
        assessment.signals.length ? `Flagged on: ${assessment.signals.map((x) => x.code).join(', ')}.` : null],
    );

    // Track this conversion in the partner's recent history for later velocity/dupe checks.
    (recentByPartner[primaryPartner] ??= []).push({
      conversionId: s.order, at: conversionAt, orderId: s.order, customerFingerprint: fingerprint,
    });

    // Blocked conversions never accrue commission.
    if (assessment.decision === 'block') continue;

    // Commission pool from the offer's default rule, split across attributed partners.
    const baseCents = computeCommission(offer.rule, { saleAmountCents: s.sale });
    if (baseCents <= 0) continue; // nothing to settle
    const weights = attribute({ touchpoints, conversionAt, model: s.model });
    const cents = allocateByWeight(baseCents, weights.map((w) => w.weight));

    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      const amount = cents[i];
      if (amount <= 0) continue;
      const attrId = (
        await c.query<{ id: string }>(
          'INSERT INTO attributions (tenant_id, conversion_id, partner_id, model, weight_bps, amount_cents) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [tenantId, conversionId, w.partnerId, s.model, Math.round(w.weight * 10000), amount],
        )
      ).rows[0].id;

      await settleLedgerEntry(c, {
        tenantId, partnerId: w.partnerId, conversionId, attributionId: attrId,
        amount, state: s.state, baseAt: conversionAt,
      });
    }
  }

  // Group paid entries into payout batches per partner.
  await c.query(
    `INSERT INTO payouts (tenant_id, partner_id, amount_cents, status)
     SELECT tenant_id, partner_id, SUM(amount_cents), 'paid'
     FROM ledger_entries WHERE tenant_id = $1 AND state = 'paid'
     GROUP BY tenant_id, partner_id`,
    [tenantId],
  );

  // A few audit-log entries for the activity feed.
  const auditRows: Array<[string, string, string]> = [
    ['offer.created', 'offer', offers.pro.id],
    ['commission_rule.created', 'offer', offers.pro.id],
    ['payout.run', 'tenant', tenantId],
    ['conversion.flagged', 'tenant', tenantId],
  ];
  for (const [action, etype, eid] of auditRows) {
    await c.query(
      'INSERT INTO audit_log (tenant_id, actor_role, action, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)',
      [tenantId, 'admin', action, etype, eid],
    );
  }
}

/** Append the ledger event stream that lands an entry in the requested state. */
async function settleLedgerEntry(
  c: PoolClient,
  e: { tenantId: string; partnerId: string; conversionId: string; attributionId: string; amount: number; state: LedgerState; baseAt: string },
): Promise<void> {
  const entryId = (
    await c.query<{ id: string }>(
      'INSERT INTO ledger_entries (tenant_id, partner_id, conversion_id, attribution_id, amount_cents, state) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [e.tenantId, e.partnerId, e.conversionId, e.attributionId, e.amount, e.state],
    )
  ).rows[0].id;

  // The event path to reach each terminal state.
  const paths: Record<LedgerState, string[]> = {
    pending: ['accrued'],
    confirmed: ['accrued', 'confirmed'],
    payable: ['accrued', 'confirmed', 'marked_payable'],
    paid: ['accrued', 'confirmed', 'marked_payable', 'paid'],
    reversed: ['accrued', 'confirmed', 'reversed'],
    clawed_back: ['accrued', 'confirmed', 'marked_payable', 'paid', 'clawed_back'],
  };
  const steps = paths[e.state];
  let seq = 1;
  for (const type of steps) {
    await c.query(
      'INSERT INTO ledger_events (tenant_id, entry_id, seq, type, amount_cents, actor, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [e.tenantId, entryId, seq, type, type === 'accrued' ? e.amount : null, 'system', e.baseAt],
    );
    seq += 1;
  }
}
