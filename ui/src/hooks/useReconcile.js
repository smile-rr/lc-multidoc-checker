import { useCallback, useEffect, useState } from 'react';
import {
  getReconcile, lockSession, unlockSession, triageReconcile,
  setCellDecision, clearCellDecision,
} from '../api';

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

  // Legacy row-level (kept for compat)
  const triage = useCallback(async (fieldKey, decision, officerId) => {
    await triageReconcile(sessionId, { fieldKey, decision, officerId });
    await refresh();
  }, [sessionId, refresh]);

  // Per-cell — main flow for the matrix UI
  const decideCell = useCallback(async ({ fieldKey, docType, decision, note, officerId }) => {
    await setCellDecision(sessionId, { fieldKey, docType, decision, note, officerId });
    await refresh();
  }, [sessionId, refresh]);

  const clearCell = useCallback(async ({ fieldKey, docType, officerId }) => {
    await clearCellDecision(sessionId, { fieldKey, docType, officerId });
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

  return { data, loading, error, refresh, triage, lock, unlock, decideCell, clearCell };
}
