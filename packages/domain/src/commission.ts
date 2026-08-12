/**
 * Commission rule evaluation. Rules are data, not code, so a program owner can
 * change payout terms without a deploy. Every rule resolves to an integer
 * number of commission cents for a given sale.
 */

import { applyBps, assertCents, MoneyError } from './money.js';

export type CommissionRule =
  | { type: 'percentage'; rateBps: number }
  | { type: 'flat'; amountCents: number }
  | { type: 'tiered'; tiers: TierBand[] }
  | { type: 'recurring'; rateBps: number; maxCycles?: number };

export interface TierBand {
  /** Lowest sale amount (inclusive) at which this band's rate applies. */
  minSaleCents: number;
  rateBps: number;
}

export interface CommissionContext {
  saleAmountCents: number;
  /** 1-based billing cycle, used by recurring rules. Defaults to 1. */
  cycle?: number;
}

export function computeCommission(rule: CommissionRule, ctx: CommissionContext): number {
  const sale = assertCents(ctx.saleAmountCents, 'saleAmountCents');
  const cycle = ctx.cycle ?? 1;

  switch (rule.type) {
    case 'percentage':
      return applyBps(sale, rule.rateBps);

    case 'flat':
      return assertCents(rule.amountCents, 'flat amountCents');

    case 'tiered': {
      if (rule.tiers.length === 0) {
        throw new MoneyError(
          'tiered rule needs at least one band. Next: add a band with minSaleCents and rateBps.',
        );
      }
      // Pick the highest band whose threshold the sale clears.
      const applicable = rule.tiers
        .filter((t) => sale >= t.minSaleCents)
        .sort((a, b) => b.minSaleCents - a.minSaleCents)[0];
      if (!applicable) return 0; // sale below the lowest band
      return applyBps(sale, applicable.rateBps);
    }

    case 'recurring': {
      if (cycle < 1) {
        throw new MoneyError(
          `cycle must be >= 1, got ${cycle}. Next: number the first recurring billing cycle as 1.`,
        );
      }
      if (rule.maxCycles !== undefined && cycle > rule.maxCycles) {
        return 0; // revshare has expired for this customer
      }
      return applyBps(sale, rule.rateBps);
    }

    default: {
      const _exhaustive: never = rule;
      throw new MoneyError(
        `unknown commission rule: ${JSON.stringify(_exhaustive)}. Next: choose percentage, flat, tiered, or recurring.`,
      );
    }
  }
}
