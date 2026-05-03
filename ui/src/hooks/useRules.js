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

  // Status-driven polling: while EXAMINE is running, poll every 2s; on transition
  // away from EXAMINE, do one final fetch and stop.
  const prevStatusRef = useRef(sessionStatus);
  useEffect(() => {
    if (!sessionId) return undefined;
    const isExamining = sessionStatus === 'EXAMINE';
    if (isExamining) {
      const t = setInterval(refresh, POLL_MS);
      prevStatusRef.current = sessionStatus;
      return () => clearInterval(t);
    }
    if (prevStatusRef.current === 'EXAMINE') {
      refresh();
    }
    prevStatusRef.current = sessionStatus;
    return undefined;
  }, [sessionId, sessionStatus, refresh]);

  const adhocRules = useMemo(
    () => (examineMeta?.adhoc_rules || []),
    [examineMeta],
  );
  const consistencyWarnings = useMemo(
    () => (examineMeta?.consistency || []),
    [examineMeta],
  );
  const triggerTraces = examineMeta?.trigger_traces || {};
  const adhocIdSet = useMemo(
    () => new Set(adhocRules.map(r => r.rule_id || r.ruleId)),
    [adhocRules],
  );
  const adhocEvidenceById = useMemo(() => {
    const m = {};
    for (const r of adhocRules) {
      const id = r.rule_id || r.ruleId;
      if (id) m[id] = r.evidenceLcClause || r.evidence_lc_clause || null;
    }
    return m;
  }, [adhocRules]);

  const rules = useMemo(() => rawRules.map(r => {
    const origin = r.origin || (adhocIdSet.has(r.ruleId) ? 'ADHOC' : 'CATALOG');
    const evidenceLcClause = r.evidenceLcClause || adhocEvidenceById[r.ruleId] || null;
    const triggerTrace = triggerTraces[r.ruleId] || null;
    return { ...r, origin, evidenceLcClause, triggerTrace };
  }), [rawRules, adhocIdSet, adhocEvidenceById, triggerTraces]);

  const override = useCallback(async (ruleId, body) => {
    await overrideRule(sessionId, ruleId, body);
    await refresh();
  }, [sessionId, refresh]);

  const reset = useCallback(async (ruleId, officerId) => {
    await clearOverride(sessionId, ruleId, officerId);
    await refresh();
  }, [sessionId, refresh]);

  return { rules, adhocRules, consistencyWarnings, loading, error, refresh, override, reset };
}
