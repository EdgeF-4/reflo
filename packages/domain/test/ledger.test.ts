import { describe, it, expect } from 'vitest';
import {
  foldEntry,
  rollupBalance,
  nextState,
  IllegalTransitionError,
  type LedgerEvent,
  type LedgerEntryView,
} from '../src/ledger.js';

function stream(...events: Array<Omit<LedgerEvent, 'seq' | 'at'>>): LedgerEvent[] {
  return events.map((e, i) => ({ ...e, seq: i + 1, at: `2026-01-0${(i % 9) + 1}T00:00:00Z` }));
}

describe('ledger state machine', () => {
  it('walks the happy path pending -> confirmed -> payable -> paid', () => {
    const view = foldEntry(
      stream(
        { type: 'accrued', amountCents: 2500 },
        { type: 'confirmed' },
        { type: 'marked_payable' },
        { type: 'paid' },
      ),
    );
    expect(view.state).toBe('paid');
    expect(view.amountCents).toBe(2500);
    expect(view.events).toBe(4);
  });

  it('supports reversal before payout', () => {
    const view = foldEntry(
      stream({ type: 'accrued', amountCents: 1000 }, { type: 'confirmed' }, { type: 'reversed' }),
    );
    expect(view.state).toBe('reversed');
  });

  it('supports clawback only after payout', () => {
    const view = foldEntry(
      stream(
        { type: 'accrued', amountCents: 1000 },
        { type: 'confirmed' },
        { type: 'marked_payable' },
        { type: 'paid' },
        { type: 'clawed_back' },
      ),
    );
    expect(view.state).toBe('clawed_back');
  });

  it('applies signed adjustments before lock and keeps the amount', () => {
    const view = foldEntry(
      stream(
        { type: 'accrued', amountCents: 1000 },
        { type: 'adjusted', amountCents: 250 },
        { type: 'adjusted', amountCents: -100 },
        { type: 'confirmed' },
      ),
    );
    expect(view.state).toBe('confirmed');
    expect(view.amountCents).toBe(1150);
  });
});

describe('illegal transitions are rejected', () => {
  it('cannot pay a pending entry', () => {
    expect(() => foldEntry(stream({ type: 'accrued', amountCents: 10 }, { type: 'paid' }))).toThrow(
      IllegalTransitionError,
    );
  });

  it('cannot claw back before payout', () => {
    expect(() =>
      foldEntry(stream({ type: 'accrued', amountCents: 10 }, { type: 'clawed_back' })),
    ).toThrow(IllegalTransitionError);
  });

  it('cannot reverse after payout', () => {
    expect(() =>
      foldEntry(
        stream(
          { type: 'accrued', amountCents: 10 },
          { type: 'confirmed' },
          { type: 'marked_payable' },
          { type: 'paid' },
          { type: 'reversed' },
        ),
      ),
    ).toThrow(IllegalTransitionError);
  });

  it('cannot start a stream with anything but accrued', () => {
    expect(() => foldEntry(stream({ type: 'confirmed' }))).toThrow(IllegalTransitionError);
  });

  it('rejects an out-of-order stream', () => {
    const bad: LedgerEvent[] = [
      { seq: 1, type: 'accrued', amountCents: 10, at: '2026-01-01T00:00:00Z' },
      { seq: 3, type: 'confirmed', at: '2026-01-02T00:00:00Z' },
    ];
    expect(() => foldEntry(bad)).toThrow(/out of order/);
  });

  it('rejects an adjustment that drives the amount negative', () => {
    expect(() =>
      foldEntry(stream({ type: 'accrued', amountCents: 100 }, { type: 'adjusted', amountCents: -200 })),
    ).toThrow(/negative/);
  });
});

describe('nextState table', () => {
  it('only allows adjustments before payout lock', () => {
    expect(nextState('pending', 'adjusted')).toBe('pending');
    expect(nextState('confirmed', 'adjusted')).toBe('confirmed');
    expect(nextState('payable', 'adjusted')).toBeNull();
    expect(nextState('paid', 'adjusted')).toBeNull();
  });
});

describe('balance rollup conserves money', () => {
  it('sums entry amounts across buckets with nothing lost', () => {
    const views: LedgerEntryView[] = [
      { state: 'pending', amountCents: 100, events: 1, lastEventAt: '' },
      { state: 'confirmed', amountCents: 200, events: 2, lastEventAt: '' },
      { state: 'payable', amountCents: 300, events: 3, lastEventAt: '' },
      { state: 'paid', amountCents: 400, events: 4, lastEventAt: '' },
      { state: 'reversed', amountCents: 50, events: 3, lastEventAt: '' },
      { state: 'clawed_back', amountCents: 400, events: 5, lastEventAt: '' },
    ];
    const b = rollupBalance(views);
    const bucketTotal =
      b.pendingCents +
      b.confirmedCents +
      b.payableCents +
      b.paidCents +
      b.reversedCents +
      b.clawedBackCents;
    const entryTotal = views.reduce((a, v) => a + v.amountCents, 0);
    expect(bucketTotal).toBe(entryTotal);
    expect(b.owedCents).toBe(600); // pending + confirmed + payable
    expect(b.netPaidCents).toBe(400);
  });
});
