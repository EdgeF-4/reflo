/**
 * Money primitives. Every amount in Reflo is an integer count of minor units
 * (cents for USD). We never use floating point to represent a balance, because
 * 0.1 + 0.2 !== 0.3 and a partner program cannot afford to lose pennies.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Assert a value is a safe, non-negative integer number of cents. */
export function assertCents(value: number, label = 'amount'): number {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of cents, got ${value}`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must be non-negative, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range`);
  }
  return value;
}

/**
 * Apply a basis-point rate to an amount and round half-up to the nearest cent.
 * 10000 bps = 100%. Rounding is deterministic so two independent runs agree.
 */
export function applyBps(amountCents: number, rateBps: number): number {
  assertCents(amountCents, 'amountCents');
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new MoneyError(`rateBps must be a non-negative integer, got ${rateBps}`);
  }
  // Math.round rounds .5 away from zero for positive numbers, which is the
  // conventional "round half up" merchants expect on invoices.
  return Math.round((amountCents * rateBps) / 10000);
}

/**
 * Split a total number of cents across a set of weights so the parts sum back
 * to EXACTLY the total, using the largest-remainder (Hamilton) method. This is
 * the core of multi-touch payout: fractional credit must never create or
 * destroy a cent.
 *
 * Returns an array aligned with `weights`. Negative totals are rejected.
 */
export function allocateByWeight(totalCents: number, weights: number[]): number[] {
  assertCents(totalCents, 'totalCents');
  if (weights.length === 0) {
    if (totalCents !== 0) {
      throw new MoneyError('cannot allocate a non-zero total across zero weights');
    }
    return [];
  }
  if (weights.some((w) => w < 0)) {
    throw new MoneyError('weights must be non-negative');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    throw new MoneyError('weights must sum to a positive number');
  }

  const exact = weights.map((w) => (totalCents * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);

  // Distribute the leftover cents to the entries with the largest fractional
  // part. Ties break toward the lower index so the result is deterministic.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  let k = 0;
  while (remainder > 0) {
    const idx = order[k % order.length]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
    remainder -= 1;
    k += 1;
  }
  return out;
}

/** Format cents as a human string for logs and UI. Not used for math. */
export function formatCents(value: number, currency = 'USD'): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${currency} ${(abs / 100).toFixed(2)}`;
}
