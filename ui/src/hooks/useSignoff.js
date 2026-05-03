import { useCallback, useEffect, useState } from 'react';
import { getSignoff, postSignoff, getMt734 } from '../api';

export function useSignoff(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true); setError(null);
    try { setData(await getSignoff(sessionId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const sign = useCallback(async (body) => {
    const res = await postSignoff(sessionId, body);
    await refresh();
    return res;
  }, [sessionId, refresh]);

  const fetchMt734 = useCallback(() => getMt734(sessionId), [sessionId]);

  return { data, loading, error, refresh, sign, fetchMt734 };
}
