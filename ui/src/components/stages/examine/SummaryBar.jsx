import React from 'react';

export function SummaryBar({ rules, docCount }) {
  const total = rules.length;
  if (total === 0) {
    return (
      <div className="bg-white border-b border-line px-6 py-4 text-sm text-muted">
        No rules to examine yet.
      </div>
    );
  }
  const counts = countByEffectiveVerdict(rules);
  const major = rules.filter(r => r.severity === 'MAJOR' && r.effectiveVerdict === 'FAIL').length;
  const attention = rules.filter(r => (r.attention || []).length > 0).length;

  return (
    <div className="bg-white border-b border-line px-6 py-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">EXAMINATION</div>
            <div className="text-[15px] font-semibold tracking-tight">
              {total} rules applied to {docCount} documents · UCP 600 · ISBP 821
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-red" />
              <b>{counts.FAIL}</b> Discrepancies
              {major > 0 && <span className="text-status-red">· {major} Major</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-gold" />
              <b>{counts.DOUBTS}</b> Doubts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-green" />
              <b>{counts.PASS}</b> Pass
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <b>{attention}</b> Need attention
            </span>
          </div>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden border border-line">
          {seg('bg-status-green', counts.PASS, total)}
          {seg('bg-status-gold',  counts.DOUBTS, total)}
          {seg('bg-status-red',   counts.FAIL, total)}
          {seg('bg-line',         counts.NOT_APPLICABLE, total)}
        </div>
      </div>
    </div>
  );
}

function seg(cls, n, total) {
  if (!n || total === 0) return null;
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />;
}

function countByEffectiveVerdict(rules) {
  const out = { PASS: 0, FAIL: 0, DOUBTS: 0, NOT_APPLICABLE: 0 };
  for (const r of rules) {
    const v = r.effectiveVerdict || r.verdict;
    if (out[v] != null) out[v]++;
  }
  return out;
}
