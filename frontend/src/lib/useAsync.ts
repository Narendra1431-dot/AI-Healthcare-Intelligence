/**
 * Minimal async data hook with loading / error / refetch states.
 * Keeps pages consistent and provides standard lifecycle handling.
 */
import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((res) => { if (active) setData(res); })
      .catch((err) => { if (active) setError(err?.message || 'Request failed'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [...deps, nonce]);

  return { data, loading, error, refetch };
}
