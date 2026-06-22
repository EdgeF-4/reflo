'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const user = getUser();
    if (!user) router.replace('/login');
    else if (user.role === 'partner') router.replace('/portal');
    else router.replace('/admin');
  }, [router]);
  return <div className="grid min-h-screen place-items-center text-slate-500">Loading Reflo…</div>;
}
