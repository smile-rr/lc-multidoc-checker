import { useCallback, useEffect, useState } from 'react';
import { getReconcile, lockSession, unlockSession, triageReconcile } from '../api';

export function useReconcile(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true); setError(null);
    try { setData(await getReconcile(sessionId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const triage = useCallback(async (fieldKey, decision, officerId) => {
    await triageReconcile(sessionId, { fieldKey, decision, officerId });
    await refresh();
  }, [sessionId, refresh]);

  const lock = useCallback(async (officerId) => {
    await lockSession(sessionId, officerId);
    await refresh();
  }, [sessionId, refresh]);

  const unlock = useCallback(async (officerId, reason) => {
    await unlockSession(sessionId, officerId, reason);
    await refresh();
  }, [sessionId, refresh]);

  return { data, loading, error, refresh, triage, lock, unlock };
}
