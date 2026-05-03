import { useCallback, useEffect, useState } from 'react';
import { getAudit } from '../api';

export function useAudit(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try { setData(await getAudit(sessionId)); }
    catch { setData({ events: [] }); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
