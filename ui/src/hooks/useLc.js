import { useEffect, useState, useCallback } from 'react';
import { getLc } from '../api';

/** Fetches LC source text + parsed fields for the Parse-stage MT700 view. */
export function useLc(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      setData(await getLc(sessionId));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
