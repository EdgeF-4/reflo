'use client';
import { useApi } from '@/lib/useApi';
import { money } from '@/lib/format';
import { Badge, Table, Loading, ErrorNote } from '@/components/ui';

interface Assessment {
  id: string;
  order_id: string;
  amount_cents: string;
  risk_score: string;
  decision: string;
  signals: { code: string; detail: string }[];
  narrative: string | null;
}

export default function FraudPage() {
  const { data, loading, error } = useApi<Assessment[]>('/reports/fraud');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Fraud review</h1>
        <p className="text-sm text-slate-500">Conversions are scored before any commission becomes payable.</p>
      </div>
      {error && <ErrorNote message={error} />}
      {loading && <Loading />}
      {data && (
        <Table head={['Order', 'Amount', 'Risk', 'Decision', 'Signals']}>
          {data.map((a) => (
            <tr key={a.id}>
              <td className="td font-medium text-slate-100">{a.order_id}</td>
              <td className="td tabular-nums">{money(a.amount_cents)}</td>
              <td className="td tabular-nums">{Number(a.risk_score).toFixed(2)}</td>
              <td className="td">
                <Badge kind={a.decision}>{a.decision}</Badge>
              </td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  {a.signals.length === 0 && <span className="text-slate-600">clean</span>}
                  {a.signals.map((s, i) => (
                    <span key={i} title={s.detail} className="rounded border border-ink-700 px-1.5 py-0.5 text-xs text-slate-400">
                      {s.code}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
