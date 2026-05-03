import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRules, overrideRule, clearOverride } from '../api';

export function useRules(sessionId, examineMeta, events) {
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

  // Live-fill: each RuleChecked event triggers a debounced re-fetch so the
  // worklist populates progressively as backend appends rows to final_report.examine.
  const ruleCheckedCount = useMemo(() => {
    if (!events) return 0;
    let n = 0;
    for (const e of events) if (e?.type === 'RuleChecked') n++;
    return n;
  }, [events]);
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!sessionId || ruleCheckedCount === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { refresh(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [ruleCheckedCount, sessionId, refresh]);

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
