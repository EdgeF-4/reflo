'use client';
import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api, reportActionableError } from '@/lib/api';
import { money, shortDate } from '@/lib/format';
import { Badge, SectionTitle, Table, Loading, ErrorNote } from '@/components/ui';

interface Entry {
  id: string;
  amount_cents: string;
  state: string;
  partner_name: string;
  order_id: string;
  created_at: string;
}

const STATES = ['', 'pending', 'confirmed', 'payable', 'paid', 'reversed', 'clawed_back'];

const ACTIONS: Record<string, { type: string; label: string }[]> = {
  pending: [
    { type: 'confirmed', label: 'Confirm' },
    { type: 'reversed', label: 'Reverse' },
  ],
  confirmed: [
    { type: 'marked_payable', label: 'Mark payable' },
    { type: 'reversed', label: 'Reverse' },
  ],
  payable: [
    { type: 'paid', label: 'Pay' },
    { type: 'reversed', label: 'Reverse' },
  ],
  paid: [{ type: 'clawed_back', label: 'Claw back' }],
};

export default function LedgerPage() {
  const [state, setState] = useState('');
  const { data, loading, error, refetch } = useApi<Entry[]>(`/ledger/entries${state ? `?state=${state}` : ''}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function act(id: string, type: string) {
    setBusy(id + type);
    setNote(null);
    try {
      await api.post(`/ledger/entries/${id}/transition`, { type });
      refetch();
    } catch (e) {
      const message = (e as Error).message;
      setNote(message);
      reportActionableError(message);
    } finally {
      setBusy(null);
    }
  }

  async function runPayouts() {
    setBusy('payouts');
    try {
      const r = await api.post<{ paidEntries: number }>('/ledger/payouts/run', {});
      setNote(`Paid ${r.paidEntries} payable entr${r.paidEntries === 1 ? 'y' : 'ies'}.`);
      refetch();
    } catch (e) {
      const message = (e as Error).message;
      setNote(message);
      reportActionableError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Settlement ledger</h1>
          <p className="text-sm text-slate-500">Every state change is an append-only, audited event.</p>
        </div>
        <button onClick={runPayouts} className="btn-primary" disabled={busy === 'payouts'}>
          {busy === 'payouts' ? 'Running…' : 'Run payouts'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Filter</span>
        <select className="input max-w-[200px]" value={state} onChange={(e) => setState(e.target.value)}>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s || 'all states'}
            </option>
          ))}
        </select>
      </div>

      {note && <div className="text-sm text-slate-400">{note}</div>}
      {error && <ErrorNote message={error} />}
      {loading && <Loading />}
      {data && (
        <Table head={['Partner', 'Order', 'Amount', 'State', 'Created', 'Actions']}>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="td font-medium text-slate-100">{e.partner_name}</td>
              <td className="td text-slate-400">{e.order_id}</td>
              <td className="td tabular-nums">{money(e.amount_cents)}</td>
              <td className="td">
                <Badge kind={e.state}>{e.state.replace('_', ' ')}</Badge>
              </td>
              <td className="td text-slate-500">{shortDate(e.created_at)}</td>
              <td className="td">
                <div className="flex gap-1.5">
                  {(ACTIONS[e.state] ?? []).map((a) => (
                    <button
                      key={a.type}
                      onClick={() => act(e.id, a.type)}
                      disabled={busy === e.id + a.type}
                      className="rounded-md border border-ink-700 px-2 py-1 text-xs text-slate-300 hover:bg-ink-800"
                    >
                      {a.label}
                    </button>
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
