'use client';
import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { actionableError, api, reportActionableError } from '@/lib/api';
import { money } from '@/lib/format';
import { Badge, Card, SectionTitle, Table, Loading, ErrorNote } from '@/components/ui';

interface Offer {
  id: string;
  name: string;
  status: string;
  destination_url: string;
  default_rule: { type: string; rateBps?: number; amountCents?: number };
}

function ruleLabel(rule: Offer['default_rule']): string {
  switch (rule.type) {
    case 'percentage':
      return `${(rule.rateBps ?? 0) / 100}% of sale`;
    case 'flat':
      return `${money(rule.amountCents ?? 0)} flat`;
    case 'tiered':
      return 'tiered by sale size';
    case 'recurring':
      return `${(rule.rateBps ?? 0) / 100}% recurring`;
    default:
      return rule.type;
  }
}

export default function OffersPage() {
  const { data, loading, error, refetch } = useApi<Offer[]>('/offers');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://northwind.example/new');
  const [rate, setRate] = useState('20');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api.post('/offers', {
        name,
        destinationUrl: url,
        defaultRule: { type: 'percentage', rateBps: Math.round(Number(rate) * 100) },
      });
      setName('');
      refetch();
    } catch (err) {
      const message = actionableError(
        err,
        'inspect the offer request and API response, correct the cause, then retry.',
      );
      setNote(message);
      reportActionableError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Offers & commissions</h1>
        <p className="text-sm text-slate-500">The catalog partners promote, each with a default commission rule.</p>
      </div>

      <Card>
        <SectionTitle title="New offer" />
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Offer name" value={name} required onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Rate %" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button className="btn-primary" disabled={busy || !name}>
            {busy ? 'Creating…' : 'Create offer'}
          </button>
          <input className="input sm:col-span-4" placeholder="Destination URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </form>
        {note && <p className="mt-2 text-sm text-rose-300">{note}</p>}
      </Card>

      {error && <ErrorNote message={error} />}
      {loading && <Loading />}
      {data && (
        <Table head={['Offer', 'Status', 'Commission', 'Destination']}>
          {data.map((o) => (
            <tr key={o.id}>
              <td className="td font-medium text-slate-100">{o.name}</td>
              <td className="td">
                <Badge>{o.status}</Badge>
              </td>
              <td className="td text-slate-300">{ruleLabel(o.default_rule)}</td>
              <td className="td text-slate-500">{o.destination_url}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
