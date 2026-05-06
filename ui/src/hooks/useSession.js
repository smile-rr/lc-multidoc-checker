import { useCallback, useEffect, useState } from 'react';
import { getSession } from '../api';

export function useSession(sessionId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const data = await getSession(sessionId);
      if (data.final_report && typeof data.final_report === 'string') {
        try { data.finalReport = JSON.parse(data.final_report); } catch (_) {}
      }
      setSession(data);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { session, loading, error, refresh };
}
