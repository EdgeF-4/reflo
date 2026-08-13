'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, reportActionableError } from './api';

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
      .catch((e: Error) => {
        setError(e.message);
        reportActionableError(e.message);
      })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
}
