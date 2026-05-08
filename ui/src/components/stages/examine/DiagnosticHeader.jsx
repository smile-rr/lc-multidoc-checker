import React from 'react';

/**
 * Compact "10 catalog rules · 6 ran · 1 NA · 3 out · 0 error" ribbon.
 * Solves the "where did the other 8 rules go?" UX problem by showing every
 * catalog rule's lifecycle outcome explicitly. Each segment is a filter pill —
 * click to scope the worklist below.
 *
 * Inputs are the already-bucketed rule arrays from ExaminePanel:
 *   active     — rules in the active worklist (PASS / FAIL / DOUBTS / FAILED / PENDING)
 *   notApplicable — rules whose LC fields were absent (NOT_APPLICABLE without [OUT_OF_SCOPE] prefix)
 *   outOfScope — rules whose required docs were not presented
 */
export function DiagnosticHeader({ active, notApplicable, outOfScope, statusFilter, onStatusFilter }) {
  const all = [...active, ...notApplicable, ...outOfScope];
  const total = all.length;
  if (total === 0) return null;

  const tally = countActive(active);
  const ranTotal = tally.PASS + tally.FAIL + tally.DOUBTS + tally.FAILED;
  // "Done" means: officer doesn't have to wait. NA (LC fields absent) and
  // OOS (docs not presented) are deterministic outcomes, not pending work —
  // they count toward done. Only PENDING is "still in flight".
  const doneTotal = ranTotal + notApplicable.length + outOfScope.length;
  const pendingTotal = tally.PENDING;

  return (
    <div className="bg-white border-b border-line px-6 py-2.5">
      <div className="flex items-center gap-4 text-[11px] font-mono">
        <DensityBar active={active} notApplicable={notApplicable} outOfScope={outOfScope} />
        <span className="text-muted">
          <span className="text-navy-1 font-semibold tabular-nums">{doneTotal}</span>
          <span className="text-[#a1a1a6]"> / </span>
          <span className="tabular-nums">{total}</span>
          <span className="ml-1 uppercase tracking-[0.15em] text-[10px]">complete</span>
          {pendingTotal > 0 && (
            <span className="ml-1 text-status-gold animate-pulse">· {pendingTotal} pending</span>
          )}
        </span>
        <Pill
          id="ran" active={statusFilter} onClick={onStatusFilter}
          color="#1d1d1f" count={ranTotal}
          detail={`${tally.PASS} ✓ · ${tally.FAIL} ✕ · ${tally.DOUBTS} ◐${tally.FAILED ? ` · ${tally.FAILED} ⚠` : ''}`}
          label="ran"
        />
        <Pill
          id="na" active={statusFilter} onClick={onStatusFilter}
          color="#6e6e73" count={notApplicable.length}
          detail="LC fields absent"
          label="not applicable"
        />
        <Pill
          id="oos" active={statusFilter} onClick={onStatusFilter}
          color="#a1a1a6" count={outOfScope.length}
          detail="docs not presented"
          label="out of scope"
        />
        {tally.PENDING > 0 && (
          <Pill id="pending" active={statusFilter} onClick={onStatusFilter}
                color="#8a5700" count={tally.PENDING} detail="" label="pending" />
        )}
        {tally.FAILED > 0 && (
          <Pill id="failed" active={statusFilter} onClick={onStatusFilter}
                color="#b54708" count={tally.FAILED} detail="needs ops review" label="errors" />
        )}
      </div>
    </div>
  );
}

function DensityBar({ active, notApplicable, outOfScope }) {
  const cells = [];
  for (const r of active) cells.push(verdictCell(r.effectiveVerdict || r.verdict));
  for (const _ of notApplicable) cells.push('na');
  for (const _ of outOfScope) cells.push('oos');
  return (
    <div className="flex h-2 gap-px">
      {cells.map((c, i) => <span key={i} className={`w-3 ${cellColor(c)}`} />)}
    </div>
  );
}

function Pill({ id, active, onClick, color, count, detail, label }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(isActive ? null : id)}
      className={`flex items-baseline gap-1.5 px-2 py-0.5 rounded transition-colors
        ${isActive ? 'bg-slate2 ring-1 ring-line' : 'hover:bg-slate2'}`}
      title={detail}
    >
      <span className="tabular-nums font-semibold" style={{ color }}>{count}</span>
      <span className="uppercase tracking-[0.15em] text-[10px] text-muted">{label}</span>
      {detail && <span className="text-[10px] text-[#a1a1a6]">— {detail}</span>}
    </button>
  );
}

function countActive(rules) {
  const out = { PASS: 0, FAIL: 0, DOUBTS: 0, NOT_APPLICABLE: 0, PENDING: 0, FAILED: 0 };
  for (const r of rules) {
    const v = r.effectiveVerdict || r.verdict;
    if (out[v] != null) out[v]++;
  }
  return out;
}

function verdictCell(v) {
  return ({ PASS: 'pass', FAIL: 'fail', DOUBTS: 'doubts',
            FAILED: 'error', PENDING: 'pending', NOT_APPLICABLE: 'na' })[v] || 'pending';
}

function cellColor(c) {
  return ({
    pass:    'bg-status-green',
    fail:    'bg-status-red',
    doubts:  'bg-status-gold',
    error:   'bg-orange-500',
    pending: 'bg-status-gold animate-pulse',
    na:      'bg-[#e5e5ea]',
    oos:     'bg-[#eeeef0]',
  })[c] || 'bg-line';
}
