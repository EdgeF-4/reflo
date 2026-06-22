/**
 * First-party, multi-touch attribution.
 *
 * Reflo does not depend on third-party cookies. Touchpoints are recorded
 * server-to-server against a first-party identity, and credit for a conversion
 * is distributed across the partners that touched the customer inside the
 * lookback window. The output is a set of per-partner weights that sum to 1;
 * pair it with `allocateByWeight` to split commission cents exactly.
 */

export const ATTRIBUTION_MODELS = [
  'last_touch',
  'first_touch',
  'linear',
  'position_based',
  'time_decay',
] as const;
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

export interface Touchpoint {
  partnerId: string;
  /** ISO-8601 timestamp of the touch (click or server-recorded visit). */
  at: string;
  channel?: string;
  /** Stable id used to dedupe repeated deliveries of the same touch. */
  touchId?: string;
}

export interface AttributionInput {
  touchpoints: Touchpoint[];
  conversionAt: string;
  model: AttributionModel;
  /** Touches older than this many days before the conversion are ignored. Default 30. */
  lookbackDays?: number;
  /** Half-life in days for the time_decay model. Default 7. */
  halfLifeDays?: number;
}

export interface PartnerWeight {
  partnerId: string;
  weight: number;
}

const DAY_MS = 86_400_000;

function toMs(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`invalid timestamp: ${iso}`);
  }
  return t;
}

/**
 * Normalise the raw touch list: drop touches that fall outside the lookback
 * window or land after the conversion, remove exact duplicate touchIds, and
 * sort oldest-first. Returns the cleaned, ordered touches.
 */
export function prepareTouchpoints(input: AttributionInput): Touchpoint[] {
  const conversionMs = toMs(input.conversionAt);
  const lookbackMs = (input.lookbackDays ?? 30) * DAY_MS;
  const windowStart = conversionMs - lookbackMs;

  const seen = new Set<string>();
  const cleaned: Array<Touchpoint & { _ms: number }> = [];

  for (const tp of input.touchpoints) {
    const ms = toMs(tp.at);
    if (ms > conversionMs) continue; // a touch cannot happen after the conversion
    if (ms < windowStart) continue; // outside the lookback window
    if (tp.touchId) {
      if (seen.has(tp.touchId)) continue;
      seen.add(tp.touchId);
    }
    cleaned.push({ ...tp, _ms: ms });
  }

  cleaned.sort((a, b) => a._ms - b._ms);
  return cleaned.map(({ _ms, ...rest }) => rest);
}

/** Per-touch weights for a model, aligned with the prepared touch order. */
function touchWeights(touches: Touchpoint[], input: AttributionInput): number[] {
  const n = touches.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  switch (input.model) {
    case 'last_touch':
      return touches.map((_, i) => (i === n - 1 ? 1 : 0));
    case 'first_touch':
      return touches.map((_, i) => (i === 0 ? 1 : 0));
    case 'linear':
      return touches.map(() => 1 / n);
    case 'position_based': {
      // U-shaped: 40% first, 40% last, 20% shared across the middle touches.
      if (n === 2) return [0.5, 0.5];
      const mid = n - 2;
      return touches.map((_, i) => {
        if (i === 0 || i === n - 1) return 0.4;
        return 0.2 / mid;
      });
    }
    case 'time_decay': {
      const halfLifeMs = (input.halfLifeDays ?? 7) * DAY_MS;
      const conversionMs = toMs(input.conversionAt);
      const raw = touches.map((t) => Math.pow(2, -((conversionMs - toMs(t.at)) / halfLifeMs)));
      const sum = raw.reduce((a, b) => a + b, 0);
      return raw.map((x) => x / sum);
    }
    default:
      throw new Error(`unknown attribution model: ${input.model}`);
  }
}

/**
 * Compute per-partner attribution weights for a conversion. Weights are summed
 * across a partner's touches and the result is normalised to sum to exactly 1
 * (modulo floating point). Returns an empty array when no touch qualifies.
 */
export function attribute(input: AttributionInput): PartnerWeight[] {
  const touches = prepareTouchpoints(input);
  if (touches.length === 0) return [];

  const weights = touchWeights(touches, input);

  const byPartner = new Map<string, number>();
  touches.forEach((t, i) => {
    byPartner.set(t.partnerId, (byPartner.get(t.partnerId) ?? 0) + weights[i]!);
  });

  const total = [...byPartner.values()].reduce((a, b) => a + b, 0);
  return [...byPartner.entries()]
    .filter(([, w]) => w > 0)
    .map(([partnerId, w]) => ({
      partnerId,
      weight: total > 0 ? w / total : 0,
    }));
}
