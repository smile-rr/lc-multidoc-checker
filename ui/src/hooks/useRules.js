import { useCallback, useEffect, useState } from 'react';
import { getRules, overrideRule, clearOverride } from '../api';

export function useRules(sessionId) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true); setError(null);
    try {
      const res = await getRules(sessionId);
      setRules(res.rules ?? []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const override = useCallback(async (ruleId, body) => {
    await overrideRule(sessionId, ruleId, body);
    await refresh();
  }, [sessionId, refresh]);

  const reset = useCallback(async (ruleId, officerId) => {
    await clearOverride(sessionId, ruleId, officerId);
    await refresh();
  }, [sessionId, refresh]);

  return { rules, loading, error, refresh, override, reset };
}
