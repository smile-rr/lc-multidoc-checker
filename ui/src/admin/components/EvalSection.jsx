import React, { useMemo, useState } from 'react';

// Synthetic deterministic "actual" verdicts for the prototype: agreement
// rate roughly mirrors the rule's eval_pass_rate.
const fakeActual = (rule, c) => {
  const pass = rule.health_signals?.eval_pass_rate ?? 0.9;
  // Deterministic per (ruleId, caseId) so re-renders show stable results
  const seed = [...(rule.rule_id + c.id)].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rand = (seed % 1000) / 1000;
  return rand < pass ? c.expected : (c.expected === 'PASS' ? 'FAIL' : 'PASS');
};

const VERDICT_CLASS = {
  PASS:           'bg-status-greenSoft text-status-green border-status-green/40',
  FAIL:           'bg-status-redSoft text-status-red border-status-red/40',
  DOUBTS:         'bg-status-goldSoft text-status-gold border-status-gold/40',
  NOT_APPLICABLE: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function EvalSection({ rule }) {
  const [filter, setFilter] = useState('all');
  const cases = rule.eval_cases || [];

  const enriched = useMemo(() => cases.map((c) => {
    const actual = fakeActual(rule, c);
    return { ...c, actual, agree: actual === c.expected };
  }), [rule, cases]);

  const totals = useMemo(() => {
    const t = { total: enriched.length, pass: 0, fail: 0, doubts: 0 };
    for (const c of enriched) {
      if (c.agree) t.pass++;
      else if (c.actual === 'DOUBTS') t.doubts++;
      else t.fail++;
    }
    return t;
  }, [enriched]);

  const filtered = enriched.filter((c) =>
    filter === 'all' ||
    (filter === 'fail' && !c.agree) ||
    (filter === 'pass' && c.agree)
  );

  const passPct = totals.total === 0 ? 0 : totals.pass / totals.total;

  return (
    <div className="bg-paper border border-line rounded">
      <div className="px-3 py-2 border-b border-line flex items-center gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Eval set</div>
          <div className="text-xs font-medium">
            {totals.pass}/{totals.total} agreement with expected verdict
          </div>
        </div>
        <div className="flex-1 mx-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${passPct * 100}%`,
              background: passPct >= 0.95 ? '#1a7a43' : passPct >= 0.85 ? '#8a5700' : '#cc0011',
            }}
          />
        </div>
        <div className="flex gap-1">
          {['all', 'fail', 'pass'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${
                filter === f
                  ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium'
                  : 'border-line text-muted hover:bg-slate2'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="text-[11px] text-teal-1 hover:underline ml-2">Run eval ▸</button>
      </div>

      {filtered.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted">No eval cases match.</div>
      )}

      <div className="divide-y divide-line">
        {filtered.map((c) => (
          <div key={c.id} className={`px-3 py-2 flex items-start gap-3 ${!c.agree ? 'bg-status-redSoft/40' : ''}`}>
            <span className="font-mono text-[10px] text-muted shrink-0 w-16">{c.id}</span>
            <span className="text-xs flex-1">{c.scenario}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${VERDICT_CLASS[c.expected] || ''}`}>
                exp {c.expected}
              </span>
              <span className="text-muted text-xs">→</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${VERDICT_CLASS[c.actual] || ''}`}>
                got {c.actual}
              </span>
              {c.agree ? (
                <span className="text-status-green text-xs" title="Agrees with expected">✓</span>
              ) : (
                <span className="text-status-red text-xs" title="Disagrees with expected">✗</span>
              )}
            </span>
            <span className="flex flex-wrap gap-0.5 shrink-0 max-w-[180px]">
              {(c.citations || []).map((id) => (
                <span key={id} className="text-[9px] font-mono text-status-blue bg-status-blueSoft px-1 rounded">{id}</span>
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="px-3 py-1.5 border-t border-line text-[10px] text-muted">
        Cases curated by senior compliance examiners; "Run eval" replays them through the published prompt and reports per-case verdict + citation match. Any override in production becomes a candidate for this set.
      </div>
    </div>
  );
}
