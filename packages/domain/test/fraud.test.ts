import { describe, it, expect } from 'vitest';
import { assessConversion, type ConversionFeatures, type PriorConversion } from '../src/fraud.js';

const clean: ConversionFeatures = {
  partnerId: 'p1',
  conversionId: 'c100',
  orderId: 'ORD-100',
  customerFingerprint: 'fp-100',
  ip: '203.0.113.10',
  clickAt: '2026-03-01T11:59:00Z',
  conversionAt: '2026-03-01T12:00:00Z',
  clickCountry: 'US',
  conversionCountry: 'US',
  amountCents: 5000,
};

describe('clean conversion', () => {
  it('passes with no signals', () => {
    const a = assessConversion(clean, { recentConversions: [] });
    expect(a.decision).toBe('allow');
    expect(a.signals).toHaveLength(0);
    expect(a.riskScore).toBe(0);
  });
});

describe('duplicate detection', () => {
  it('flags a repeated order id', () => {
    const prior: PriorConversion[] = [{ conversionId: 'c1', at: '2026-03-01T11:00:00Z', orderId: 'ORD-100' }];
    const a = assessConversion(clean, { recentConversions: prior });
    expect(a.signals.some((s) => s.code === 'duplicate')).toBe(true);
    expect(a.decision).toBe('review');
  });
});

describe('velocity detection', () => {
  it('flags a burst within the window', () => {
    const prior: PriorConversion[] = Array.from({ length: 6 }, (_, i) => ({
      conversionId: `b${i}`,
      at: '2026-03-01T11:59:40Z',
    }));
    const a = assessConversion(clean, { recentConversions: prior });
    expect(a.signals.some((s) => s.code === 'velocity')).toBe(true);
  });
});

describe('geo mismatch', () => {
  it('flags a click and conversion in different countries', () => {
    const a = assessConversion({ ...clean, clickCountry: 'NG', conversionCountry: 'US' }, {
      recentConversions: [],
    });
    expect(a.signals.some((s) => s.code === 'geo_mismatch')).toBe(true);
  });
});

describe('low dwell', () => {
  it('flags a sub-threshold gap between click and conversion', () => {
    const a = assessConversion(
      { ...clean, clickAt: '2026-03-01T12:00:00Z', conversionAt: '2026-03-01T12:00:01Z' },
      { recentConversions: [] },
    );
    expect(a.signals.some((s) => s.code === 'low_dwell')).toBe(true);
  });
});

describe('stacked signals escalate to block', () => {
  it('blocks a conversion that trips duplicate, velocity, geo and dwell', () => {
    const prior: PriorConversion[] = [
      { conversionId: 'x', at: '2026-03-01T11:59:55Z', orderId: 'ORD-100' },
      ...Array.from({ length: 6 }, (_, i) => ({ conversionId: `v${i}`, at: '2026-03-01T11:59:50Z' })),
    ];
    const a = assessConversion(
      {
        ...clean,
        clickAt: '2026-03-01T12:00:00Z',
        conversionAt: '2026-03-01T12:00:01Z',
        clickCountry: 'NG',
        conversionCountry: 'US',
      },
      { recentConversions: prior },
    );
    expect(a.decision).toBe('block');
    expect(a.riskScore).toBeGreaterThanOrEqual(0.8);
  });
});

describe('thresholds are configurable', () => {
  it('honours a stricter review threshold', () => {
    const a = assessConversion(
      { ...clean, clickCountry: 'NG', conversionCountry: 'US' },
      { recentConversions: [], thresholds: { reviewAt: 0.25 } },
    );
    expect(a.decision).toBe('review'); // geo signal scores 0.3 >= 0.25
  });
});
