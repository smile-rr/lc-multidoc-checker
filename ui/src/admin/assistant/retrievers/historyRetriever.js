import history from '../sessionHistory.json';

export const totals = () => ({
  sessions: history.sessions.length,
  windowDays: history.windowDays,
  compliant: history.sessions.filter((s) => s.compliant).length,
});

export const ruleStats = () => {
  const m = new Map();
  for (const s of history.sessions) {
    for (const r of s.ruleResults) {
      const e = m.get(r.rule_id) || { rule_id: r.rule_id, runs: 0, fail: 0, doubt: 0, overrides: 0 };
      e.runs += 1;
      if (r.verdict === 'FAIL') e.fail += 1;
      if (r.verdict === 'DOUBTS') e.doubt += 1;
      if (r.overridden) e.overrides += 1;
      m.set(r.rule_id, e);
    }
  }
  return [...m.values()].map((e) => ({
    ...e,
    fail_rate: +(e.fail / e.runs).toFixed(2),
    override_rate: +(e.overrides / e.runs).toFixed(2),
  }));
};

export const topOverridden = (limit = 5) => ruleStats()
  .filter((r) => r.overrides > 0)
  .sort((a, b) => b.override_rate - a.override_rate)
  .slice(0, limit);

export const topFailed = (limit = 5) => ruleStats()
  .sort((a, b) => b.fail - a.fail || b.fail_rate - a.fail_rate)
  .slice(0, limit);

export const fieldCorrectionStats = () => {
  const m = new Map();
  for (const s of history.sessions) {
    for (const f of s.fieldCorrections) {
      const k = `${f.field_key}@${f.doc}`;
      const e = m.get(k) || { field_key: f.field_key, doc: f.doc, count: 0, kinds: {} };
      e.count += 1;
      e.kinds[f.kind] = (e.kinds[f.kind] || 0) + 1;
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
};

export const sessionsCitingReason = (needle) => history.sessions
  .filter((s) => s.ruleResults.some((r) => r.override_reason && r.override_reason.toLowerCase().includes(needle.toLowerCase())))
  .map((s) => s.id);

export const findSession = (id) => history.sessions.find((s) => s.id === String(id));
