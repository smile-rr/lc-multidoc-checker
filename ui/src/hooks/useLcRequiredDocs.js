import { useCallback, useEffect, useState } from 'react';
import { getLcRequiredDocs } from '../api';

export function useLcRequiredDocs(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try { setData(await getLcRequiredDocs(sessionId)); }
    catch { setData({ parsed46A: '', required: [] }); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
