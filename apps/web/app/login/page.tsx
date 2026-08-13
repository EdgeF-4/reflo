'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, reportActionableError, setSession } from '@/lib/api';
import { ErrorNote } from '@/components/ui';

const DEMO = [
  { label: 'Admin', email: 'admin@northwind.test' },
  { label: 'Analyst', email: 'analyst@northwind.test' },
  { label: 'Partner', email: 'partner@northwind.test' },
];

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenant] = useState('northwind');
  const [email, setEmail] = useState('admin@northwind.test');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.login(tenantSlug, email, password);
      setSession(token, user);
      router.replace(user.role === 'partner' ? '/portal' : '/admin');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      reportActionableError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-100">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-ink-950">R</span>
            Reflo
          </div>
          <p className="mt-2 text-sm text-slate-500">Partner attribution and settlement</p>
        </div>
        <form onSubmit={submit} className="card space-y-3 p-6">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Workspace</label>
            <input className="input" value={tenantSlug} onChange={(e) => setTenant(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <ErrorNote message={error} />}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-slate-500">
          Demo logins (password <code className="text-slate-400">demo1234</code>):
          <div className="mt-2 flex justify-center gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => setEmail(d.email)}
                className="rounded-md border border-ink-700 px-2 py-1 text-slate-400 hover:bg-ink-800"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
