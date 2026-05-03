import { useEffect, useMemo, useState } from 'react';

/**
 * Stage progress derivation.
 *
 * Given the SSE `events` array + the session status + whether the stage has
 * completed, produce a unified phase/label/sub/idx/total/secsSinceLast/isStale
 * shape that the StageProgressMeter can render.
 *
 * `phase`:
 *   pending  — officer hasn't triggered this stage yet
 *   running  — backend is actively working (or just was; staleness is separate)
 *   complete — stage has finished (StageCompleted seen, or stagesCompleted has it)
 *
 * `secsSinceLast` is the seconds since the most recent matching progress event.
 * `isStale` = secsSinceLast > 5. The component pulses while fresh, dims while
 * stale, providing a "backend may be slow" signal without lying about state.
 *
 * Inputs:
 *   events          — array of raw SSE event objects: { type, ts, data, ... }
 *   stage           — 'intake' | 'parse' | 'reconcile' | 'examine' | 'signoff'
 *   sessionStatus   — backend status string (matches stage in upper-case while running)
 *   stageCompleted  — boolean (from stagesCompleted Set)
 */
export function useStageProgress(events, stage, sessionStatus, stageCompleted) {
  // tick every 1s while running so secsSinceLast/isStale recompute live
  const [now, setNow] = useState(() => Date.now());

  // Derive the latest progress info from events (cheap: walks once backward).
  const info = useMemo(() => deriveStageInfo(events ?? [], stage), [events, stage]);

  const phase = derivePhase(stage, sessionStatus, stageCompleted, info);
  const running = phase === 'running';

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const secsSinceLast = info.lastTs ? Math.max(0, Math.round((now - info.lastTs) / 1000)) : null;
  const isStale = secsSinceLast != null && secsSinceLast > 5;

  return {
    phase,
    label: info.label ?? defaultLabel(stage, phase),
    sub: info.sub,
    idx: info.idx,
    total: info.total,
    secsSinceLast,
    isStale,
  };
}

// ─── stage → phase ────────────────────────────────────────────────────────
function derivePhase(stage, sessionStatus, stageCompleted, info) {
  if (stageCompleted) return 'complete';

  const status = (sessionStatus || '').toUpperCase();
  const stageUpper = stage.toUpperCase();

  if (status === stageUpper) return 'running';

  // Parse stage has a special case: the latest ExtractionProgress may still be
  // non-terminal even though the session has moved on momentarily. Treat any
  // in-flight extraction as running.
  if (stage === 'parse' && info.kind === 'extract' && info.terminal === false) {
    return 'running';
  }

  return 'pending';
}

// ─── walk events backward, find latest matching progress event ───────────
function deriveStageInfo(events, stage) {
  // For each stage we look for the relevant event types in order of priority.
  // Walks backward so we naturally pick the most recent.
  let lastTs = null;
  let info = { kind: null, lastTs: null };

  if (stage === 'examine') {
    // RuleStarted gives us the live counter. RuleChecked tells us how many
    // are done. We pair the latest RuleStarted with the count of RuleCheckeds
    // that share its run.
    let started = null;
    let checkedCount = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (!started && e.type === 'RuleStarted') {
        started = e;
        lastTs = parseTs(e.ts);
      }
      if (e.type === 'RuleChecked') checkedCount++;
      if (started && e.type === 'StageStarted' && e.data?.stageName === 'examine') break;
    }
    if (started) {
      const d = started.data || {};
      const idx = d.index ?? checkedCount + 1;
      const total = d.total;
      info = {
        kind: 'rule',
        label: 'Examine',
        sub: `${d.ruleId}${d.checkType ? ` (${d.checkType})` : ''}`,
        idx,
        total,
        lastTs,
      };
    }
    return info;
  }

  if (stage === 'parse') {
    // Find latest ExtractionProgress; capture its docType/slot/status.
    let last = null;
    let totalDocs = new Set();
    let completeDocs = new Set();
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type !== 'ExtractionProgress') continue;
      if (!last) last = e;
      const d = e.data || {};
      if (d.docType) totalDocs.add(d.docType);
      if (d.status === 'complete' && d.docType) completeDocs.add(d.docType);
    }
    if (last) {
      const d = last.data || {};
      const status = String(d.status || '');
      const terminal = status === 'complete' || status.startsWith('failed');
      lastTs = parseTs(last.ts);
      info = {
        kind: 'extract',
        label: 'Parse',
        sub: `${d.docType ?? ''} ${d.slot ?? ''} · ${status}`.trim(),
        idx: completeDocs.size || undefined,
        total: totalDocs.size || undefined,
        terminal,
        lastTs,
      };
    }
    return info;
  }

  if (stage === 'intake' || stage === 'reconcile' || stage === 'signoff') {
    // No fine-grained per-step events today. Use StageStarted's ts so the
    // pulse dot has a heartbeat; staleness then signals "still no progress".
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'StageStarted' && e.data?.stageName === stage) {
        lastTs = parseTs(e.ts);
        break;
      }
    }
    info = {
      kind: 'stage',
      label: stageLabel(stage),
      sub: stageFallbackSub(stage),
      lastTs,
    };
    return info;
  }

  return info;
}

function defaultLabel(stage, phase) {
  if (phase === 'pending') return stageLabel(stage);
  return stageLabel(stage);
}

function stageLabel(stage) {
  switch (stage) {
    case 'intake':    return 'Intake';
    case 'parse':     return 'Parse';
    case 'reconcile': return 'Reconcile';
    case 'examine':   return 'Examine';
    case 'signoff':   return 'Sign-off';
    default:          return stage;
  }
}

function stageFallbackSub(stage) {
  switch (stage) {
    case 'intake':    return 'classifying…';
    case 'reconcile': return 'normalising…';
    case 'signoff':   return 'finalising…';
    default:          return null;
  }
}

function parseTs(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}
