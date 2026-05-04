import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useSse } from '../hooks/useSse';
import { useReconcile } from '../hooks/useReconcile';
import { useSignoff } from '../hooks/useSignoff';
import { useSessionStatus } from '../context/SessionStatusContext';
import { useDevMode } from '../context/DevModeContext';
import { SessionStatusBar } from '../components/shell/SessionStatusBar';
import { IntakePanel }    from '../components/stages/IntakePanel';
import { ParsePanel }     from '../components/stages/ParsePanel';
import { ReconcilePanel } from '../components/stages/ReconcilePanel';
import { ExaminePanel }   from '../components/stages/ExaminePanel';
import { SignoffPanel }   from '../components/stages/SignoffPanel';
import { Spinner } from '../components/shared/Spinner';
import { runStage } from '../api';
import { OFFICER_ID } from '../lib/officer';

const STAGE_ORDER = ['intake', 'parse', 'reconcile', 'examine', 'signoff'];

export function SessionPage() {
  const { id } = useParams();
  const { session, loading, error, refresh } = useSession(id);
  const {
    events, stagesCompleted, ruleResults, sessionCompleted,
    officerActions, signedOff, cancelled, currentActivity, stagesRerun,
  } = useSse(id);
  const { setRunningInfo, setEventCount } = useSessionStatus();
  const { enabled: devMode } = useDevMode();

  // Reconcile + signoff state for gate computation
  const { data: reconcileData } = useReconcile(id);
  const { data: signoffData } = useSignoff(id);

  const [activeStage, setActiveStage] = useState(null);

  // Sync top-nav running chip with live counts
  useEffect(() => {
    if (!id) return;
    const status = sessionCompleted ? 'COMPLETED' : (session?.status ?? 'RUNNING');
    setRunningInfo({
      id,
      status,
      eventCount: events.length,
      docCount: session?.doc_count ?? null,
    });
    setEventCount(events.length);
    return () => { setRunningInfo(null); setEventCount(0); };
  }, [id, session?.status, session?.doc_count, sessionCompleted, events.length, setRunningInfo, setEventCount]);

  // Refetch session when SSE signals progress (or after a rerun resets state).
  // Listening to a StageStarted count too — without it, the session.status
  // stays at the previous AWAITING_OFFICER value after the officer clicks
  // Continue, so per-stage hooks (useRules' EXAMINE polling, ExaminePanel's
  // showPhaseStrip) never kick in until something else triggers a refresh.
  const stagesStartedCount = useMemo(
    () => events.filter(e => e?.type === 'StageStarted').length,
    [events]
  );
  useEffect(() => {
    if (stagesStartedCount > 0 || stagesCompleted.size > 0 || sessionCompleted
        || officerActions.length > 0 || signedOff || cancelled || stagesRerun > 0) {
      refresh();
    }
  }, [stagesStartedCount, stagesCompleted.size, sessionCompleted, officerActions.length,
      signedOff, cancelled, stagesRerun, refresh]);

  // ── Gates ──────────────────────────────────────────────────────────────
  const docs = session?.documents ?? [];
  const lcPresent = docs.some(d => d.doc_type === 'LC');
  const allConfirmed = docs.every(d => d.doc_type !== 'UNKNOWN' && d.confirmed_by_officer !== false);
  const intakeGate = lcPresent && allConfirmed;

  const parseDocs = docs.filter(d => d.doc_type !== 'UNKNOWN' && d.doc_type !== 'LC');
  const allReviewed = parseDocs.length > 0 && parseDocs.every(d => d.parse_status === 'REVIEWED');
  const parseGate = allReviewed;

  const locked = !!reconcileData?.locked;
  const reconcileGate = locked;

  const examineGate = !!stagesCompleted?.has('examine');
  const signoffGate = !!signoffData?.signed;

  // SSE only carries StageCompleted for live sessions — its ring buffer doesn't
  // reach back to a session signed hours ago. Merge the persisted
  // session.stage_completed_at map (and the signoff record) so the breadcrumb
  // ticks survive a page reload.
  const effectiveCompleted = useMemo(() => {
    const out = new Set(stagesCompleted);
    const raw = session?.stage_completed_at;
    if (raw) {
      try {
        const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const k of Object.keys(m || {})) out.add(k);
      } catch { /* ignore malformed */ }
    }
    if (signoffGate) out.add('signoff');
    return out;
  }, [stagesCompleted, session?.stage_completed_at, signoffGate]);

  const reachable = useMemo(() => {
    if (devMode) return new Set(STAGE_ORDER);
    // Once signed, the session is an immutable record — every stage opens for
    // read-only review. Without this, a page-reload on an old signed session
    // gets `examineGate=false` (StageCompleted SSE events aren't in the ring
    // buffer anymore) and the breadcrumb locks the officer out of the audit
    // trail they just signed.
    if (signoffGate) return new Set(STAGE_ORDER);
    const r = new Set(['intake']);
    if (intakeGate) r.add('parse');
    if (intakeGate && parseGate) r.add('reconcile');
    if (intakeGate && parseGate && reconcileGate) r.add('examine');
    if (intakeGate && parseGate && reconcileGate && examineGate) r.add('signoff');
    return r;
  }, [devMode, signoffGate, intakeGate, parseGate, reconcileGate, examineGate]);

  // Initialize active stage on first load.
  //
  // Important: dev mode makes every tab CLICKABLE (`reachable`), but the
  // pipeline itself is still officer-paced — Continue must be clicked stage by
  // stage. So the landing tab follows the strict gate flow, not `reachable`.
  // Otherwise dev mode lands the officer on Signoff right after upload, which
  // breaks the natural intake→parse→… review flow.
  const landingTarget = useMemo(() => {
    if (signoffData?.signed) return 'signoff';
    let t = 'intake';
    if (intakeGate) t = 'parse';
    if (intakeGate && parseGate) t = 'reconcile';
    if (intakeGate && parseGate && reconcileGate) t = 'examine';
    if (intakeGate && parseGate && reconcileGate && examineGate) t = 'signoff';
    return t;
  }, [intakeGate, parseGate, reconcileGate, examineGate, signoffData?.signed]);

  // Defer initial landing until BOTH session and signoff have resolved.
  // Without waiting on signoffData, a fresh page-load on a signed session
  // computes landingTarget on the first render (signoffData still null →
  // falls back to gate logic → lands on reconcile). By the time signoffData
  // arrives a tick later, activeStage is already pinned and the recomputed
  // 'signoff' target is ignored.
  useEffect(() => {
    if (activeStage !== null) return;
    if (!session) return;
    if (signoffData === null) return;
    setActiveStage(landingTarget);
  }, [activeStage, session, signoffData, landingTarget]);

  // goNext: officer trigger to advance the pipeline by one stage.
  // Calls POST /sessions/{id}/stages/{nextStage}/run on the backend, then navigates.
  // Backend validates against session.next_stage; UI just navigates if completed already.
  const goNext = async () => {
    const i = STAGE_ORDER.indexOf(activeStage);
    if (i >= STAGE_ORDER.length - 1) return;
    const next = STAGE_ORDER[i + 1];
    // Trigger backend run only if session is awaiting that stage.
    if (session?.awaiting_officer && session?.next_stage?.toLowerCase() === next) {
      try {
        await runStage(id, next, OFFICER_ID);
        // Pull the fresh session state so child panels (ExaminePanel etc.)
        // see status='EXAMINE' immediately and start polling/streaming —
        // otherwise we land on the next tab with stale 'AWAITING_OFFICER'.
        await refresh();
      }
      catch (e) { console.error('runStage failed', e); /* navigate anyway */ }
    }
    setActiveStage(next);
  };
  const goBack = () => {
    const i = STAGE_ORDER.indexOf(activeStage);
    if (i > 0) setActiveStage(STAGE_ORDER[i - 1]);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner label="Loading session…" />
      </div>
    );
  }
  if (error || !session) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <div className="text-[18px] font-semibold text-navy-1">Session not found</div>
        <div className="text-[13px] text-muted font-mono break-all max-w-md text-center">
          {id}
        </div>
        {error && error.length > 0 && error.length < 200 && (
          <div className="text-[11px] text-status-red font-mono">{error}</div>
        )}
        <a
          href="/"
          className="text-[12px] mt-2 px-3 py-1.5 rounded border border-line text-navy-1 hover:bg-slate2 transition-colors"
        >
          ← Back to home
        </a>
      </div>
    );
  }
  if (activeStage === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner label="Loading session…" />
      </div>
    );
  }

  const props = {
    session, stagesCompleted, events, ruleResults, sessionCompleted,
    currentActivity, cancelled, refresh,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <SessionStatusBar
        activeStage={activeStage}
        completedStages={effectiveCompleted}
        reachable={reachable}
        onSelect={setActiveStage}
        events={events}
        sessionId={id}
        docCount={session?.doc_count}
        sessionStatus={sessionCompleted ? 'COMPLETED' : (session?.status ?? 'RUNNING')}
        compliant={session?.compliant}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeStage === 'intake'    && <IntakePanel    {...props} onContinue={goNext} />}
        {activeStage === 'parse'     && <ParsePanel     {...props} onContinue={goNext} />}
        {activeStage === 'reconcile' && <ReconcilePanel {...props} onContinue={goNext} onBackToParse={goBack} />}
        {activeStage === 'examine'   && <ExaminePanel   {...props} onContinue={goNext} onBack={goBack} />}
        {activeStage === 'signoff'   && <SignoffPanel   {...props} onBack={goBack} />}
      </div>
    </div>
  );
}

