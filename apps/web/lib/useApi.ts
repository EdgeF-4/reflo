'use client';
import { useCallback, useEffect, useState } from 'react';
import { actionableError, api, reportActionableError } from './api';

/** Fetch a GET endpoint with loading and error state, plus a refetch handle. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);

  const refetch = useCallback(() => {
    if (path === null) return;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        const message = actionableError(
          e,
          'inspect the requested API route and browser console, correct the cause, then retry.',
        );
        setError(message);
        reportActionableError(message);
      })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
}
