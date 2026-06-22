/**
 * Event-sourced settlement ledger.
 *
 * A ledger entry is the commission owed for one attributed conversion. We never
 * mutate an entry's state in place; instead every change is an append-only
 * event, and the current state is a deterministic fold over that event stream.
 * This gives us a tamper-evident audit trail for money movement: you can always
 * replay exactly how a balance came to be.
 *
 * State machine:
 *
 *   (none) --accrued--> pending
 *   pending --confirmed--> confirmed
 *   confirmed --marked_payable--> payable
 *   payable --paid--> paid
 *   {pending,confirmed,payable} --reversed--> reversed   (cancel before payout)
 *   paid --clawed_back--> clawed_back                    (recoup after payout)
 *   {pending,confirmed} --adjusted--> (same state)       (correct the amount)
 *
 * `reversed` and `clawed_back` are terminal.
 */

import { assertCents } from './money.js';

export const LEDGER_STATES = [
  'pending',
  'confirmed',
  'payable',
  'paid',
  'reversed',
  'clawed_back',
] as const;
export type LedgerState = (typeof LEDGER_STATES)[number];

export const LEDGER_EVENT_TYPES = [
  'accrued',
  'confirmed',
  'marked_payable',
  'paid',
  'reversed',
  'clawed_back',
  'adjusted',
] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export interface LedgerEvent {
  /** Monotonic position within this entry's stream, starting at 1. */
  seq: number;
  type: LedgerEventType;
  /** Required for `accrued` (the initial amount) and `adjusted` (a signed delta). */
  amountCents?: number;
  /** ISO-8601 timestamp of when the event happened. */
  at: string;
  /** Identifier of the actor that caused the event (user id, rule id, system). */
  actor?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerEntryView {
  state: LedgerState;
  /** Current commission amount after any adjustments, in cents. */
  amountCents: number;
  events: number;
  lastEventAt: string;
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: LedgerState | 'none',
    public readonly via: LedgerEventType,
  ) {
    super(`illegal ledger transition: cannot apply "${via}" while in state "${from}"`);
    this.name = 'IllegalTransitionError';
  }
}

/** Returns the next state for a legal transition, or null if illegal. */
export function nextState(from: LedgerState | 'none', via: LedgerEventType): LedgerState | null {
  switch (via) {
    case 'accrued':
      return from === 'none' ? 'pending' : null;
    case 'confirmed':
      return from === 'pending' ? 'confirmed' : null;
    case 'marked_payable':
      return from === 'confirmed' ? 'payable' : null;
    case 'paid':
      return from === 'payable' ? 'paid' : null;
    case 'reversed':
      return from === 'pending' || from === 'confirmed' || from === 'payable' ? 'reversed' : null;
    case 'clawed_back':
      return from === 'paid' ? 'clawed_back' : null;
    case 'adjusted':
      // Amount corrections are only allowed before the amount is locked for payout.
      return from === 'pending' || from === 'confirmed' ? from : null;
    default:
      return null;
  }
}

export function canTransition(from: LedgerState | 'none', via: LedgerEventType): boolean {
  return nextState(from, via) !== null;
}

/**
 * Fold an entry's event stream into its current view. Throws if the stream is
 * malformed (bad sequence numbers, illegal transition, negative amount).
 */
export function foldEntry(events: LedgerEvent[]): LedgerEntryView {
  if (events.length === 0) {
    throw new Error('cannot fold an empty ledger stream');
  }

  let state: LedgerState | 'none' = 'none';
  let amountCents = 0;
  let lastEventAt = '';

  events.forEach((ev, idx) => {
    if (ev.seq !== idx + 1) {
      throw new Error(`ledger stream out of order: expected seq ${idx + 1}, got ${ev.seq}`);
    }
    const target = nextState(state, ev.type);
    if (target === null) {
      throw new IllegalTransitionError(state, ev.type);
    }

    if (ev.type === 'accrued') {
      amountCents = assertCents(ev.amountCents ?? -1, 'accrued amount');
    } else if (ev.type === 'adjusted') {
      if (ev.amountCents === undefined) {
        throw new Error('adjusted event requires a signed amountCents delta');
      }
      const updated = amountCents + ev.amountCents;
      if (updated < 0) {
        throw new Error('adjustment would drive the entry amount negative');
      }
      amountCents = updated;
    }

    state = target;
    lastEventAt = ev.at;
  });

  return { state: state as LedgerState, amountCents, events: events.length, lastEventAt };
}

export interface LedgerBalance {
  pendingCents: number;
  confirmedCents: number;
  payableCents: number;
  paidCents: number;
  reversedCents: number;
  clawedBackCents: number;
  /** Earned but not yet paid out and not cancelled. */
  owedCents: number;
  /** Net cash actually delivered to the partner. */
  netPaidCents: number;
}

/**
 * Aggregate many entry views into a partner (or program) balance. Each entry
 * lands in exactly one bucket, so the buckets always sum to the total amount
 * across entries: money is conserved, never created or destroyed by a state
 * change. This invariant is asserted by the test suite.
 */
export function rollupBalance(entries: LedgerEntryView[]): LedgerBalance {
  const b: LedgerBalance = {
    pendingCents: 0,
    confirmedCents: 0,
    payableCents: 0,
    paidCents: 0,
    reversedCents: 0,
    clawedBackCents: 0,
    owedCents: 0,
    netPaidCents: 0,
  };
  for (const e of entries) {
    switch (e.state) {
      case 'pending':
        b.pendingCents += e.amountCents;
        break;
      case 'confirmed':
        b.confirmedCents += e.amountCents;
        break;
      case 'payable':
        b.payableCents += e.amountCents;
        break;
      case 'paid':
        b.paidCents += e.amountCents;
        break;
      case 'reversed':
        b.reversedCents += e.amountCents;
        break;
      case 'clawed_back':
        b.clawedBackCents += e.amountCents;
        break;
    }
  }
  b.owedCents = b.pendingCents + b.confirmedCents + b.payableCents;
  // A clawed-back entry was paid, then recouped, so its net cash delivered is 0.
  b.netPaidCents = b.paidCents;
  return b;
}
