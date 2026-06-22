'use client';
import { useApi } from '@/lib/useApi';
import { money, shortDate, pct } from '@/lib/format';
import { Stat, Badge, SectionTitle, Table, Card, Loading, ErrorNote } from '@/components/ui';

interface Overview {
  owedCents: number;
  payableCents: number;
  paidCents: number;
  pendingCents: number;
  conversions: number;
}
interface LedgerRow {
  id: string;
  amount_cents: string;
  state: string;
  order_id: string;
  created_at: string;
}
interface OfferRow {
  tracking_code: string;
  approved: boolean;
  name: string;
  destination_url: string;
  default_rule: { type: string; rateBps?: number; amountCents?: number };
}

function ruleLabel(rule: OfferRow['default_rule']): string {
  if (rule.type === 'percentage') return pct(rule.rateBps ?? 0);
  if (rule.type === 'flat') return `${money(rule.amountCents ?? 0)} flat`;
  return rule.type;
}

export default function PortalPage() {
  const overview = useApi<Overview>('/portal/overview');
  const ledger = useApi<LedgerRow[]>('/portal/ledger');
  const offers = useApi<OfferRow[]>('/portal/offers');

  if (overview.error) return <ErrorNote message={overview.error} />;
  if (!overview.data) return <Loading label="Loading your dashboard" />;
  const o = overview.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Your earnings</h1>
        <p className="text-sm text-slate-500">Transparent, real-time commission you can audit yourself.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total owed" value={money(o.owedCents)} sub="not yet paid" />
        <Stat label="Ready to pay" value={money(o.payableCents)} accent />
        <Stat label="Paid to date" value={money(o.paidCents)} />
        <Stat label="Conversions" value={o.conversions} />
      </div>

      <div>
        <SectionTitle title="Your offers & tracking links" />
        {offers.data && (
          <Table head={['Offer', 'Commission', 'Tracking code', 'Status']}>
            {offers.data.map((r) => (
              <tr key={r.tracking_code}>
                <td className="td font-medium text-slate-100">{r.name}</td>
                <td className="td text-slate-300">{ruleLabel(r.default_rule)}</td>
                <td className="td">
                  <code className="rounded bg-ink-900 px-2 py-0.5 text-brand-400">{r.tracking_code}</code>
                </td>
                <td className="td">
                  <Badge kind={r.approved ? 'paid' : 'pending'}>{r.approved ? 'approved' : 'pending'}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <div>
        <SectionTitle title="Commission ledger" />
        {ledger.data && (
          <Table head={['Order', 'Amount', 'State', 'Date']}>
            {ledger.data.map((e) => (
              <tr key={e.id}>
                <td className="td text-slate-400">{e.order_id}</td>
                <td className="td tabular-nums">{money(e.amount_cents)}</td>
                <td className="td">
                  <Badge kind={e.state}>{e.state.replace('_', ' ')}</Badge>
                </td>
                <td className="td text-slate-500">{shortDate(e.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
