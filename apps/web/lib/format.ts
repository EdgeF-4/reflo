/** Render integer cents as a currency string for display only. */
export function money(cents: number | string | null | undefined, currency = 'USD'): string {
  const n = Number(cents ?? 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(bps: number | string): string {
  return `${(Number(bps) / 100).toFixed(0)}%`;
}

export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export const STATE_STYLES: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  confirmed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  payable: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-brand-500/15 text-brand-400 border-brand-500/30',
  reversed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  clawed_back: 'bg-rose-600/20 text-rose-300 border-rose-600/40',
  allow: 'bg-brand-500/15 text-brand-400 border-brand-500/30',
  review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  block: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
