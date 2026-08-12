/**
 * Deterministic fraud and anomaly scoring.
 *
 * This is the part of the AI fraud layer that gates money, so it is rule-based,
 * explainable, and unit-tested: every flagged conversion comes with the exact
 * signals that fired. A separate, optional LLM layer (see apps/api) turns these
 * signals into a plain-language narrative, but the payout decision never depends
 * on a model that could hallucinate.
 */

export interface ConversionFeatures {
  partnerId: string;
  conversionId: string;
  orderId?: string;
  /** Hash of email or device, never the raw value. */
  customerFingerprint?: string;
  ip?: string;
  /** Last click time, if any. */
  clickAt?: string;
  conversionAt: string;
  clickCountry?: string;
  conversionCountry?: string;
  amountCents: number;
}

export interface PriorConversion {
  conversionId: string;
  at: string;
  orderId?: string;
  customerFingerprint?: string;
  ip?: string;
}

export interface FraudThresholds {
  /** Window over which velocity is measured. */
  velocityWindowMs: number;
  /** Conversions within the window above which velocity looks abnormal. */
  velocityMax: number;
  /** Click-to-conversion gaps shorter than this look automated. */
  minDwellMs: number;
  reviewAt: number;
  blockAt: number;
}

export const DEFAULT_THRESHOLDS: FraudThresholds = {
  velocityWindowMs: 60_000,
  velocityMax: 5,
  minDwellMs: 3_000,
  reviewAt: 0.5,
  blockAt: 0.8,
};

export interface FraudContext {
  recentConversions: PriorConversion[];
  now?: string;
  thresholds?: Partial<FraudThresholds>;
}

export interface FraudSignal {
  code: 'velocity' | 'duplicate' | 'geo_mismatch' | 'low_dwell';
  score: number;
  detail: string;
}

export interface FraudAssessment {
  conversionId: string;
  partnerId: string;
  riskScore: number;
  decision: 'allow' | 'review' | 'block';
  signals: FraudSignal[];
}

function parse(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(
      `invalid timestamp: ${iso}. Next: provide an ISO-8601 timestamp such as 2026-06-01T12:00:00Z.`,
    );
  }
  return t;
}

/**
 * Score a single conversion against the partner's recent history. The risk
 * score is the saturated sum of independent signals, capped at 1. The decision
 * is derived purely from the thresholds so it is reproducible.
 */
export function assessConversion(
  features: ConversionFeatures,
  context: FraudContext,
): FraudAssessment {
  const th: FraudThresholds = { ...DEFAULT_THRESHOLDS, ...(context.thresholds ?? {}) };
  const conversionMs = parse(features.conversionAt);
  const signals: FraudSignal[] = [];

  // 1. Velocity: a burst of conversions in a short window is the classic
  //    signature of replayed or scripted traffic.
  const windowStart = conversionMs - th.velocityWindowMs;
  const inWindow = context.recentConversions.filter((c) => {
    const ms = parse(c.at);
    return ms >= windowStart && ms <= conversionMs;
  });
  if (inWindow.length >= th.velocityMax) {
    const over = inWindow.length - th.velocityMax + 1;
    signals.push({
      code: 'velocity',
      score: Math.min(0.6, 0.2 + over * 0.1),
      detail: `${inWindow.length} conversions within ${Math.round(th.velocityWindowMs / 1000)}s`,
    });
  }

  // 2. Duplicate: same order id or same customer fingerprint already seen means
  //    the same sale is being claimed twice.
  const dupOrder =
    features.orderId !== undefined &&
    context.recentConversions.some((c) => c.orderId === features.orderId);
  const dupCustomer =
    features.customerFingerprint !== undefined &&
    context.recentConversions.some(
      (c) => c.customerFingerprint === features.customerFingerprint,
    );
  if (dupOrder || dupCustomer) {
    signals.push({
      code: 'duplicate',
      score: 0.7,
      detail: dupOrder ? `duplicate order id ${features.orderId}` : 'duplicate customer fingerprint',
    });
  }

  // 3. Geo mismatch: the click and the conversion resolving to different
  //    countries is a weak-but-real signal of proxy or incentivised traffic.
  if (
    features.clickCountry &&
    features.conversionCountry &&
    features.clickCountry !== features.conversionCountry
  ) {
    signals.push({
      code: 'geo_mismatch',
      score: 0.3,
      detail: `click in ${features.clickCountry}, conversion in ${features.conversionCountry}`,
    });
  }

  // 4. Low dwell: a human needs time between clicking and buying. A sub-second
  //    gap points at automation or a forged click timestamp.
  if (features.clickAt) {
    const dwell = conversionMs - parse(features.clickAt);
    if (dwell >= 0 && dwell < th.minDwellMs) {
      signals.push({
        code: 'low_dwell',
        score: 0.4,
        detail: `${dwell}ms between click and conversion`,
      });
    }
  }

  const riskScore = Math.min(1, signals.reduce((a, s) => a + s.score, 0));
  let decision: FraudAssessment['decision'] = 'allow';
  if (riskScore >= th.blockAt) decision = 'block';
  else if (riskScore >= th.reviewAt) decision = 'review';

  return {
    conversionId: features.conversionId,
    partnerId: features.partnerId,
    riskScore: Math.round(riskScore * 1000) / 1000,
    decision,
    signals,
  };
}
