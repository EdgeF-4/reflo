'use client';
import { useApi } from '@/lib/useApi';
import { Table, Loading, ErrorNote, Badge } from '@/components/ui';

interface AuditRow {
  id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  occurred_at: string;
}

export default function AuditPage() {
  const { data, loading, error } = useApi<AuditRow[]>('/reports/audit');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Audit log</h1>
        <p className="text-sm text-slate-500">An immutable record of every privileged action in the workspace.</p>
      </div>
      {error && <ErrorNote message={error} />}
      {loading && <Loading />}
      {data && (
        <Table head={['When', 'Actor', 'Action', 'Entity']}>
          {data.map((r) => (
            <tr key={r.id}>
              <td className="td text-slate-500">{new Date(r.occurred_at).toLocaleString()}</td>
              <td className="td">
                <Badge>{r.actor_role}</Badge>
              </td>
              <td className="td font-medium text-slate-200">{r.action}</td>
              <td className="td text-slate-400">{r.entity_type}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
