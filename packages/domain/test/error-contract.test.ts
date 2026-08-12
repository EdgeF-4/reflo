import { describe, expect, it } from 'vitest';
import {
  allocateByWeight,
  applyBps,
  assertCents,
  assessConversion,
  attribute,
  computeCommission,
  foldEntry,
  type AttributionInput,
  type CommissionRule,
  type LedgerEvent,
} from '../src/index.js';

function expectNextAction(run: () => unknown): void {
  expect(run).toThrow(/Next: /);
}

const at = '2026-06-01T12:00:00Z';

describe('public domain error contract', () => {
  it('gives a next action for every money rejection', () => {
    expectNextAction(() => assertCents(1.5));
    expectNextAction(() => assertCents(-1));
    expectNextAction(() => assertCents(Number.MAX_SAFE_INTEGER + 1));
    expectNextAction(() => applyBps(100, -1));
    expectNextAction(() => allocateByWeight(100, []));
    expectNextAction(() => allocateByWeight(100, [-1, 2]));
    expectNextAction(() => allocateByWeight(100, [0, 0]));
  });

  it('gives a next action for every commission-rule rejection', () => {
    expectNextAction(() =>
      computeCommission({ type: 'tiered', tiers: [] }, { saleAmountCents: 100 }),
    );
    expectNextAction(() =>
      computeCommission(
        { type: 'recurring', rateBps: 100 },
        { saleAmountCents: 100, cycle: 0 },
      ),
    );
    expectNextAction(() =>
      computeCommission(
        { type: 'unsupported' } as unknown as CommissionRule,
        { saleAmountCents: 100 },
      ),
    );
  });

  it('gives a next action for malformed attribution and fraud timestamps', () => {
    expectNextAction(() =>
      attribute({ touchpoints: [], conversionAt: 'not-a-date', model: 'linear' }),
    );
    expectNextAction(() =>
      attribute({
        touchpoints: [{ partnerId: 'p1', at: 'not-a-date' }],
        conversionAt: at,
        model: 'linear',
      }),
    );
    expectNextAction(() =>
      attribute({
        touchpoints: [
          { partnerId: 'p1', at: '2026-05-30T12:00:00Z' },
          { partnerId: 'p2', at },
        ],
        conversionAt: at,
        model: 'unsupported',
      } as unknown as AttributionInput),
    );
    expectNextAction(() =>
      assessConversion(
        { partnerId: 'p1', conversionId: 'c1', conversionAt: 'bad', amountCents: 1 },
        { recentConversions: [] },
      ),
    );
    expectNextAction(() =>
      assessConversion(
        { partnerId: 'p1', conversionId: 'c1', conversionAt: at, amountCents: 1 },
        { recentConversions: [{ conversionId: 'old', at: 'bad' }] },
      ),
    );
  });

  it('gives a next action for every malformed ledger stream', () => {
    const accrued: LedgerEvent = { seq: 1, type: 'accrued', amountCents: 100, at };
    expectNextAction(() => foldEntry([]));
    expectNextAction(() => foldEntry([{ ...accrued, seq: 2 }]));
    expectNextAction(() => foldEntry([{ seq: 1, type: 'confirmed', at }]));
    expectNextAction(() => foldEntry([accrued, { seq: 2, type: 'adjusted', at }]));
    expectNextAction(() =>
      foldEntry([accrued, { seq: 2, type: 'adjusted', amountCents: -101, at }]),
    );
  });
});
