import { describe, it, expect } from 'vitest';
import { attribute, prepareTouchpoints, type AttributionInput } from '../src/attribution.js';
import { allocateByWeight } from '../src/money.js';

const base = (over: Partial<AttributionInput>): AttributionInput => ({
  touchpoints: [],
  conversionAt: '2026-02-01T00:00:00Z',
  model: 'linear',
  ...over,
});

describe('touchpoint preparation', () => {
  it('drops touches outside the lookback window and after the conversion', () => {
    const prepared = prepareTouchpoints(
      base({
        lookbackDays: 30,
        touchpoints: [
          { partnerId: 'p1', at: '2025-12-01T00:00:00Z' }, // too old
          { partnerId: 'p2', at: '2026-01-20T00:00:00Z' }, // in window
          { partnerId: 'p3', at: '2026-02-05T00:00:00Z' }, // after conversion
        ],
      }),
    );
    expect(prepared.map((t) => t.partnerId)).toEqual(['p2']);
  });

  it('dedupes repeated touchIds and sorts oldest first', () => {
    const prepared = prepareTouchpoints(
      base({
        touchpoints: [
          { partnerId: 'p2', at: '2026-01-20T00:00:00Z', touchId: 'b' },
          { partnerId: 'p1', at: '2026-01-10T00:00:00Z', touchId: 'a' },
          { partnerId: 'p2', at: '2026-01-20T00:00:00Z', touchId: 'b' }, // dup
        ],
      }),
    );
    expect(prepared.map((t) => t.touchId)).toEqual(['a', 'b']);
  });
});

describe('attribution models', () => {
  const touchpoints = [
    { partnerId: 'first', at: '2026-01-10T00:00:00Z' },
    { partnerId: 'mid', at: '2026-01-20T00:00:00Z' },
    { partnerId: 'last', at: '2026-01-30T00:00:00Z' },
  ];

  it('last_touch gives all credit to the final partner', () => {
    const w = attribute(base({ model: 'last_touch', touchpoints }));
    expect(w).toEqual([{ partnerId: 'last', weight: 1 }]);
  });

  it('first_touch gives all credit to the first partner', () => {
    const w = attribute(base({ model: 'first_touch', touchpoints }));
    expect(w).toEqual([{ partnerId: 'first', weight: 1 }]);
  });

  it('linear splits evenly', () => {
    const w = attribute(base({ model: 'linear', touchpoints }));
    for (const x of w) expect(x.weight).toBeCloseTo(1 / 3, 10);
  });

  it('position_based is U-shaped 40/20/40', () => {
    const w = attribute(base({ model: 'position_based', touchpoints }));
    const byId = Object.fromEntries(w.map((x) => [x.partnerId, x.weight]));
    expect(byId.first).toBeCloseTo(0.4, 10);
    expect(byId.last).toBeCloseTo(0.4, 10);
    expect(byId.mid).toBeCloseTo(0.2, 10);
  });

  it('time_decay favours touches closer to the conversion', () => {
    const w = attribute(base({ model: 'time_decay', touchpoints, halfLifeDays: 7 }));
    const byId = Object.fromEntries(w.map((x) => [x.partnerId, x.weight]));
    expect(byId.last).toBeGreaterThan(byId.mid);
    expect(byId.mid).toBeGreaterThan(byId.first);
  });

  it('every model produces weights that sum to 1', () => {
    for (const model of ['last_touch', 'first_touch', 'linear', 'position_based', 'time_decay'] as const) {
      const w = attribute(base({ model, touchpoints }));
      const sum = w.reduce((a, x) => a + x.weight, 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('aggregates multiple touches from the same partner', () => {
    const w = attribute(
      base({
        model: 'linear',
        touchpoints: [
          { partnerId: 'p1', at: '2026-01-10T00:00:00Z' },
          { partnerId: 'p1', at: '2026-01-15T00:00:00Z' },
          { partnerId: 'p2', at: '2026-01-20T00:00:00Z' },
        ],
      }),
    );
    const byId = Object.fromEntries(w.map((x) => [x.partnerId, x.weight]));
    expect(byId.p1).toBeCloseTo(2 / 3, 10);
    expect(byId.p2).toBeCloseTo(1 / 3, 10);
  });

  it('returns nothing when no touch qualifies', () => {
    expect(attribute(base({ model: 'linear', touchpoints: [] }))).toEqual([]);
  });
});

describe('attribution feeds an exact cents payout', () => {
  it('splits a commission across partners with no penny lost', () => {
    const w = attribute(
      base({
        model: 'linear',
        touchpoints: [
          { partnerId: 'a', at: '2026-01-10T00:00:00Z' },
          { partnerId: 'b', at: '2026-01-20T00:00:00Z' },
          { partnerId: 'c', at: '2026-01-30T00:00:00Z' },
        ],
      }),
    );
    const cents = allocateByWeight(1000, w.map((x) => x.weight));
    expect(cents.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
