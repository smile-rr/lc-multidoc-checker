import React, { useMemo } from 'react';

const PHASES = ['derive', 'plan', 'check', 'review'];
const LABELS = { derive: 'Derive', plan: 'Plan', check: 'Check', review: 'Review' };

/**
 * Stage-3 phase strip: Derive → Plan → Check → Review.
 *
 * Drives entirely off ExaminePhase SSE events plus a count of RuleChecked
 * events for the live "M/N" counter inside the check phase.
 */
export function ExaminePhaseStrip({ events, session, examineDone, deriveSummary }) {
  const { latestPhase, planMeta, checkMeta, checkedCount } = useMemo(
    () => derivePhaseInfo(events ?? []), [events]);

  const stageRunning = (session?.status || '').toUpperCase() === 'EXAMINE';
  // If the stage has completed, treat all phases as done; if no phase events
  // have arrived yet but stage is running, show derive as active.
  const currentPhase = examineDone ? null
    : (latestPhase || (stageRunning ? 'derive' : null));

  return (
    <div className="bg-slate2 border-b border-line px-6 py-3">
      <div className="flex items-center gap-0">
        {PHASES.map((p, i) => {
          const state = phaseState(p, currentPhase, examineDone);
          return (
            <React.Fragment key={p}>
              <PhaseNode
                phase={p}
                state={state}
                planMeta={planMeta}
                checkMeta={checkMeta}
                checkedCount={checkedCount}
                deriveSummary={deriveSummary}
              />
              {i < PHASES.length - 1 && <Connector active={state === 'done' || state === 'active'} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function phaseState(phase, current, done) {
  if (done) return 'done';
  if (current == null) return 'future';
  const ci = PHASES.indexOf(current);
  const pi = PHASES.indexOf(phase);
  if (pi < ci) return 'done';
  if (pi === ci) return 'active';
  return 'future';
}

function PhaseNode({ phase, state, planMeta, checkMeta, checkedCount, deriveSummary }) {
  const isActive = state === 'active';
  const isDone = state === 'done';

  const dotCls = isActive
    ? 'bg-status-gold animate-pulse'
    : isDone
      ? 'bg-status-green'
      : 'border border-line bg-white';
  const labelCls = isActive
    ? 'text-status-gold'
    : isDone
      ? 'text-status-green'
      : 'text-muted';

  return (
    <div className="flex flex-col items-center min-w-[110px]">
      <div className="flex items-center justify-center w-6 h-6">
        <span className={`w-3 h-3 rounded-full ${dotCls}`}>
          {isDone && <span className="sr-only">done</span>}
        </span>
      </div>
      <div className={`mt-1 text-[10px] font-mono uppercase tracking-[0.15em] ${labelCls}`}>
        {LABELS[phase]}
      </div>
      <div className="mt-0.5 text-[10px] font-mono text-muted text-center min-h-[14px]">
        {phaseDetail(phase, state, planMeta, checkMeta, checkedCount, deriveSummary)}
      </div>
    </div>
  );
}

function phaseDetail(phase, state, planMeta, checkMeta, checkedCount, deriveSummary) {
  if (phase === 'derive') {
    if (state === 'future') return 'pending';
    if (state === 'active') return 'running…';
    return deriveSummary || 'done';
  }
  if (phase === 'plan') {
    if (state === 'future') return 'pending';
    if (state === 'active') return 'planning…';
    const n = planMeta?.adhocCount;
    return Number.isFinite(n) ? `${n} proposed` : 'done';
  }
  if (phase === 'check') {
    if (state === 'future') return 'pending';
    const total = checkMeta?.total;
    if (state === 'active') {
      if (Number.isFinite(total)) return `${checkedCount}/${total}`;
      return `${checkedCount} checked`;
    }
    return Number.isFinite(total) ? `${total}/${total}` : 'done';
  }
  if (phase === 'review') {
    if (state === 'future') return 'pending';
    if (state === 'active') return 'finalising…';
    return 'done';
  }
  return '';
}

function Connector({ active }) {
  return (
    <div className="flex-1 h-px mx-1" style={{ background: active ? '#d4a020' : '#e5e7eb' }} />
  );
}

function derivePhaseInfo(events) {
  let latestPhase = null;
  let planMeta = null;
  let checkMeta = null;
  let checkedCount = 0;
  // walk forward so we can count RuleChecked since the last 'check' phase entry
  let inCheck = false;
  for (const e of events) {
    if (e.type === 'StageStarted' && e.data?.stageName === 'examine') {
      latestPhase = null;
      planMeta = null;
      checkMeta = null;
      checkedCount = 0;
      inCheck = false;
    }
    if (e.type === 'ExaminePhase') {
      const d = e.data || {};
      latestPhase = d.phase;
      if (d.phase === 'plan') planMeta = { adhocCount: d.adhocCount };
      if (d.phase === 'check') {
        checkMeta = { total: d.total };
        inCheck = true;
        checkedCount = 0;
      }
      if (d.phase === 'review') inCheck = false;
    }
    if (e.type === 'RuleChecked' && inCheck) checkedCount++;
  }
  return { latestPhase, planMeta, checkMeta, checkedCount };
}
