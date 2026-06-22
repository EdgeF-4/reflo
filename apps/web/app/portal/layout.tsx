'use client';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getUser, SessionUser } from '@/lib/api';

export default function PortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace('/login');
    else if (u.role !== 'partner') router.replace('/admin');
    else setUser(u);
  }, [router]);

  if (!user) return <div className="grid min-h-screen place-items-center text-slate-500">…</div>;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-ink-800 px-6 py-3">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-ink-950">R</span>
          Reflo · Partner portal
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{user.name ?? user.email}</span>
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
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}
