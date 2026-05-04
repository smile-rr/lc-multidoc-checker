import React from 'react';

/**
 * Visual-only verdict spread. Numerical counts and progress live in:
 *   - StageToolbar's meta (verdict tally on completion)
 *   - WorklistTable header (M / N progress, GROUP BY)
 *   - RuleDrawer (per-rule detail)
 * SummaryBar is purely the density bar — a quick at-a-glance visual signal,
 * no duplicated numbers.
 */
export function SummaryBar({ rules }) {
  const total = rules.length;
  if (total === 0) return null;
  const counts = countByEffectiveVerdict(rules);
  return (
    <div className="bg-white border-b border-line px-6 py-2">
      <div className="h-1.5 flex rounded-full overflow-hidden border border-line/60">
        {seg('bg-status-green', counts.PASS, total)}
        {seg('bg-status-gold',  counts.DOUBTS, total)}
        {seg('bg-status-red',   counts.FAIL, total)}
        {seg('bg-orange-500',   counts.FAILED, total)}
        {seg('bg-line',         counts.NOT_APPLICABLE + counts.PENDING, total)}
      </div>
    </div>
  );
}

function seg(cls, n, total) {
  if (!n || total === 0) return null;
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />;
}

function countByEffectiveVerdict(rules) {
  const out = { PASS: 0, FAIL: 0, DOUBTS: 0, NOT_APPLICABLE: 0, PENDING: 0, FAILED: 0 };
  for (const r of rules) {
    const v = r.effectiveVerdict || r.verdict;
    if (out[v] != null) out[v]++;
  }
  return out;
}
