'use client';
import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { actionableError, api, reportActionableError } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { Badge, Card, SectionTitle, Table, Loading, ErrorNote } from '@/components/ui';

interface Partner {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

export default function PartnersPage() {
  const { data, loading, error, refetch } = useApi<Partner[]>('/partners');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api.post('/partners', { name, email });
      setName('');
      setEmail('');
      refetch();
    } catch (err) {
      const message = actionableError(
        err,
        'inspect the partner request and API response, correct the cause, then retry.',
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
        <h1 className="text-xl font-semibold text-slate-100">Partners</h1>
        <p className="text-sm text-slate-500">Affiliates and referral partners in your program.</p>
      </div>

      <Card>
        <SectionTitle title="Add partner" />
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={name} required onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Email" value={email} required onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary" disabled={busy || !name || !email}>
            {busy ? 'Adding…' : 'Add partner'}
          </button>
        </form>
        {note && <p className="mt-2 text-sm text-rose-300">{note}</p>}
      </Card>

      {error && <ErrorNote message={error} />}
      {loading && <Loading />}
      {data && (
        <Table head={['Partner', 'Email', 'Status', 'Joined']}>
          {data.map((p) => (
            <tr key={p.id}>
              <td className="td font-medium text-slate-100">{p.name}</td>
              <td className="td text-slate-400">{p.email}</td>
              <td className="td">
                <Badge>{p.status}</Badge>
              </td>
              <td className="td text-slate-500">{shortDate(p.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
