import { useCallback, useEffect, useState } from 'react';
import { getDocExtracts } from '../api';

export function useDocExtracts(sessionId, docId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId || !docId) { setData(null); return; }
    setLoading(true); setError(null);
    try { setData(await getDocExtracts(sessionId, docId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [sessionId, docId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
