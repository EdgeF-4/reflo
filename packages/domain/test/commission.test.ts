import { describe, it, expect } from 'vitest';
import { computeCommission, type CommissionRule } from '../src/commission.js';

describe('percentage rule', () => {
  it('takes a basis-point cut with half-up rounding', () => {
    expect(computeCommission({ type: 'percentage', rateBps: 2000 }, { saleAmountCents: 10000 })).toBe(
      2000,
    );
    expect(computeCommission({ type: 'percentage', rateBps: 1500 }, { saleAmountCents: 199 })).toBe(30);
  });
});

describe('flat rule', () => {
  it('pays a fixed bounty regardless of sale size', () => {
    expect(computeCommission({ type: 'flat', amountCents: 500 }, { saleAmountCents: 999999 })).toBe(500);
  });
});

describe('tiered rule', () => {
  const rule: CommissionRule = {
    type: 'tiered',
    tiers: [
      { minSaleCents: 0, rateBps: 1000 },
      { minSaleCents: 10000, rateBps: 1500 },
      { minSaleCents: 50000, rateBps: 2000 },
    ],
  };
  it('selects the highest band the sale clears', () => {
    expect(computeCommission(rule, { saleAmountCents: 5000 })).toBe(500); // 10%
    expect(computeCommission(rule, { saleAmountCents: 20000 })).toBe(3000); // 15%
    expect(computeCommission(rule, { saleAmountCents: 100000 })).toBe(20000); // 20%
  });
});

describe('recurring rule', () => {
  const rule: CommissionRule = { type: 'recurring', rateBps: 2000, maxCycles: 12 };
  it('pays each cycle inside the cap', () => {
    expect(computeCommission(rule, { saleAmountCents: 5000, cycle: 1 })).toBe(1000);
    expect(computeCommission(rule, { saleAmountCents: 5000, cycle: 12 })).toBe(1000);
  });
  it('stops paying after the cap', () => {
    expect(computeCommission(rule, { saleAmountCents: 5000, cycle: 13 })).toBe(0);
  });
});
