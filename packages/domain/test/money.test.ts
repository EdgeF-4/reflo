import { describe, it, expect } from 'vitest';
import { allocateByWeight, applyBps, assertCents, formatCents, MoneyError } from '../src/money.js';

describe('assertCents', () => {
  it('accepts non-negative integers', () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(150)).toBe(150);
  });
  it('rejects floats and negatives', () => {
    expect(() => assertCents(1.5)).toThrow(MoneyError);
    expect(() => assertCents(-1)).toThrow(MoneyError);
  });
});

describe('applyBps', () => {
  it('computes percentage with half-up rounding', () => {
    expect(applyBps(10000, 1500)).toBe(1500); // 15% of $100.00 = $15.00
    expect(applyBps(199, 1500)).toBe(30); // 15% of $1.99 = 29.85 -> 30
    expect(applyBps(101, 5000)).toBe(51); // 50% of 101 = 50.5 -> 51
  });
  it('handles zero', () => {
    expect(applyBps(0, 1500)).toBe(0);
    expect(applyBps(5000, 0)).toBe(0);
  });
});

describe('allocateByWeight', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocateByWeight(100, [1, 1])).toEqual([50, 50]);
  });

  it('never loses or invents a cent on an odd split', () => {
    const parts = allocateByWeight(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.sort()).toEqual([33, 33, 34]);
  });

  it('distributes leftover to the largest fractional remainders', () => {
    // 1000 cents across 70/20/10: exact = 700/200/100 -> clean
    expect(allocateByWeight(1000, [70, 20, 10])).toEqual([700, 200, 100]);
    // 100 cents across 1/1/1/1/1/1/1 (7 ways): each 14.28..., sum must stay 100
    const seven = allocateByWeight(100, [1, 1, 1, 1, 1, 1, 1]);
    expect(seven.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('is exact across a large fuzz sweep', () => {
    for (let total = 0; total < 500; total += 7) {
      for (const w of [[1, 2, 3], [5, 5, 5, 1], [99, 1], [1, 1, 1, 1, 1, 1]]) {
        const parts = allocateByWeight(total, w);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts.every((p) => p >= 0)).toBe(true);
      }
    }
  });

  it('rejects negative weights and zero-sum weights', () => {
    expect(() => allocateByWeight(100, [-1, 2])).toThrow(MoneyError);
    expect(() => allocateByWeight(100, [0, 0])).toThrow(MoneyError);
  });

  it('allocates zero across zero weights', () => {
    expect(allocateByWeight(0, [])).toEqual([]);
  });
});

describe('formatCents', () => {
  it('renders signed money', () => {
    expect(formatCents(1599)).toBe('USD 15.99');
    expect(formatCents(-500)).toBe('-USD 5.00');
  });
});
