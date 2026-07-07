import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRules, overrideRule, clearOverride } from '../api';

const POLL_MS = 2000;

export function useRules(sessionId, sessionStatus, examineMeta) {
  const [rawRules, setRawRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true); setError(null);
    try {
      const res = await getRules(sessionId);
      setRawRules(res.rules ?? []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Status-driven polling: while COMPLIANCE_CHECK is running, poll every 2s; on transition
  // away from COMPLIANCE_CHECK, do one final fetch and stop.
  const prevStatusRef = useRef(sessionStatus);
  useEffect(() => {
    if (!sessionId) return undefined;
    const isExamining = sessionStatus === 'COMPLIANCE_CHECK';
    if (isExamining) {
      const t = setInterval(refresh, POLL_MS);
      prevStatusRef.current = sessionStatus;
      return () => clearInterval(t);
    }
    if (prevStatusRef.current === 'COMPLIANCE_CHECK') {
      refresh();
    }
    prevStatusRef.current = sessionStatus;
    return undefined;
  }, [sessionId, sessionStatus, refresh]);

  const consistencyWarnings = useMemo(
    () => (examineMeta?.consistency || []),
    [examineMeta],
  );
  const triggerTraces = examineMeta?.trigger_traces || {};

  const rules = useMemo(() => rawRules.map((r, i) => {
    const triggerTrace = triggerTraces[r.ruleId] || null;
    // seqNum = position in the backend's response. Backend emits rules in
    // catalog-declared order, so this is the canonical "rule sequence" used
    // as the worklist's default sort key.
    return { ...r, triggerTrace, seqNum: i };
  }), [rawRules, triggerTraces]);

  const override = useCallback(async (ruleId, body) => {
    await overrideRule(sessionId, ruleId, body);
    await refresh();
  }, [sessionId, refresh]);

  const reset = useCallback(async (ruleId, officerId) => {
    await clearOverride(sessionId, ruleId, officerId);
    await refresh();
  }, [sessionId, refresh]);

  return { rules, consistencyWarnings, loading, error, refresh, override, reset };
}
