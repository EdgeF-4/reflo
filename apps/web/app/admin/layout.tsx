'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getUser, SessionUser } from '@/lib/api';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/ledger', label: 'Settlement ledger' },
  { href: '/admin/offers', label: 'Offers & commissions' },
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/fraud', label: 'Fraud review' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace('/login');
    else if (u.role === 'partner') router.replace('/portal');
    else setUser(u);
  }, [router]);

  if (!user) return <div className="grid min-h-screen place-items-center text-slate-500">…</div>;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-ink-800 bg-ink-900/50 p-4 md:block">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-ink-950">R</span>
          Reflo
        </Link>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  active ? 'bg-brand-500/10 text-brand-400' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-ink-800 px-6 py-3">
          <div className="text-sm text-slate-400">
            Workspace <span className="text-slate-200">northwind</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">
              {user.name ?? user.email} · <span className="text-brand-400">{user.role}</span>
            </span>
            <button
              onClick={() => {
                clearSession();
                router.replace('/login');
              }}
              className="btn-ghost py-1.5"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
