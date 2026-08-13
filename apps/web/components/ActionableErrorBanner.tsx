'use client';

import { useEffect, useState } from 'react';
import {
  ACTIONABLE_ERROR_EVENT,
  clearActionableError,
  getLastActionableError,
} from '@/lib/api';

export function ActionableErrorBanner() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const show = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(ACTIONABLE_ERROR_EVENT, show);
    setMessage(getLastActionableError());
    return () => window.removeEventListener(ACTIONABLE_ERROR_EVENT, show);
  }, []);

  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-4 bg-rose-950 px-4 py-3 text-sm text-rose-100" role="alert">
      <span>{message}</span>
      <button
        className="underline"
        onClick={() => {
          clearActionableError();
          setMessage('');
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
