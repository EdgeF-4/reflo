import { ReactNode } from 'react';
import { STATE_STYLES } from '@/lib/format';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent ? 'text-brand-400' : 'text-slate-100'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Badge({ kind, children }: { kind?: string; children: ReactNode }) {
  const style = (kind && STATE_STYLES[kind]) || 'bg-ink-700 text-slate-300 border-ink-600';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="py-8 text-center text-sm text-slate-500">{label}…</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
      {message}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="border-b border-ink-700 bg-ink-900/60">
          <tr>
            {head.map((h) => (
              <th key={h} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">{children}</tbody>
      </table>
    </div>
  );
}
