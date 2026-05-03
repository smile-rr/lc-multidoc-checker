import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useSse } from '../hooks/useSse';
import { useReconcile } from '../hooks/useReconcile';
import { useSignoff } from '../hooks/useSignoff';
import { useSessionStatus } from '../context/SessionStatusContext';
import { useDevMode } from '../context/DevModeContext';
import { PipelineNav } from '../components/shell/PipelineNav';
import { IntakePanel }    from '../components/stages/IntakePanel';
import { ParsePanel }     from '../components/stages/ParsePanel';
import { ReconcilePanel } from '../components/stages/ReconcilePanel';
import { ExaminePanel }   from '../components/stages/ExaminePanel';
import { SignoffPanel }   from '../components/stages/SignoffPanel';
import { Spinner } from '../components/shared/Spinner';

const STAGE_ORDER = ['intake', 'parse', 'reconcile', 'examine', 'signoff'];

export function SessionPage() {
  const { id } = useParams();
  const { session, loading, error, refresh } = useSession(id);
  const {
    events, stagesCompleted, ruleResults, sessionCompleted,
    officerActions, signedOff, cancelled, currentActivity, ruleProgress, stagesRerun,
  } = useSse(id);
  const { setRunningInfo } = useSessionStatus();
  const { enabled: devMode } = useDevMode();

  // Reconcile + signoff state for gate computation
  const { data: reconcileData } = useReconcile(id);
  const { data: signoffData } = useSignoff(id);

  const [activeStage, setActiveStage] = useState('intake');

  // Sync top-nav running chip
  useEffect(() => {
    if (!id) return;
    const status = sessionCompleted ? 'COMPLETED' : (session?.status ?? 'RUNNING');
    setRunningInfo({ id, status });
    return () => setRunningInfo(null);
  }, [id, session?.status, sessionCompleted, setRunningInfo]);

  // Refetch session when SSE signals progress (or after a rerun resets state)
  useEffect(() => {
    if (stagesCompleted.size > 0 || sessionCompleted || officerActions.length > 0 || signedOff
        || cancelled || stagesRerun > 0) {
      refresh();
    }
  }, [stagesCompleted.size, sessionCompleted, officerActions.length, signedOff,
      cancelled, stagesRerun, refresh]);

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

  const reachable = useMemo(() => {
    if (devMode) return new Set(STAGE_ORDER);
    const r = new Set(['intake']);
    if (intakeGate) r.add('parse');
    if (intakeGate && parseGate) r.add('reconcile');
    if (intakeGate && parseGate && reconcileGate) r.add('examine');
    if (intakeGate && parseGate && reconcileGate && examineGate) r.add('signoff');
    return r;
  }, [devMode, intakeGate, parseGate, reconcileGate, examineGate]);

  const goNext = () => {
    const i = STAGE_ORDER.indexOf(activeStage);
    if (i < STAGE_ORDER.length - 1) setActiveStage(STAGE_ORDER[i + 1]);
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
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-status-red text-sm">{error}</p>
      </div>
    );
  }

  const props = {
    session, stagesCompleted, events, ruleResults, sessionCompleted,
    ruleProgress, currentActivity, cancelled, refresh,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      <div className="bg-paper border-b border-line px-6 py-2 flex items-center gap-4 shrink-0">
        <span className="text-xs font-mono text-[#a1a1a6]">{id?.slice(0, 8)}</span>
        <StatusPill session={session} sessionCompleted={sessionCompleted} signedOff={signedOff || signoffData?.signed} />
        {events.length > 0 && (
          <span className="text-xs text-[#a1a1a6]">{events.length} events</span>
        )}
        {session?.doc_count != null && (
          <span className="text-xs text-[#a1a1a6]">{session.doc_count} doc{session.doc_count !== 1 ? 's' : ''}</span>
        )}
        {locked && <span className="text-xs px-2 py-0.5 rounded bg-teal-1 text-white font-mono">🔒 LOCKED</span>}
        {cancelled && <span className="text-xs px-2 py-0.5 rounded bg-status-gold text-white font-mono">⏹ CANCELLED at {cancelled.atStage}</span>}
        {(signoffData?.signed) && <span className="text-xs px-2 py-0.5 rounded bg-status-green text-white font-mono">✎ SIGNED</span>}
      </div>

      <PipelineNav
        activeStage={activeStage}
        completedStages={stagesCompleted}
        reachable={reachable}
        onSelect={setActiveStage}
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

function StatusPill({ session, sessionCompleted, signedOff }) {
  const status = session?.status;
  const compliant = session?.finalReport?.compliant ?? session?.compliant ?? sessionCompleted?.compliant;

  if (status === 'COMPLETED') {
    return compliant === true
      ? <span className="text-xs px-2 py-0.5 rounded bg-status-greenSoft text-status-green border border-[#86efac]">COMPLIANT</span>
      : compliant === false
        ? <span className="text-xs px-2 py-0.5 rounded bg-status-redSoft text-status-red border border-[#fca5a5]">DISCREPANT</span>
        : <span className="text-xs text-status-green">COMPLETED</span>;
  }
  if (status === 'FAILED') {
    return <span className="text-xs px-2 py-0.5 rounded bg-status-redSoft text-status-red border border-[#fca5a5]">FAILED</span>;
  }
  return <span className="text-xs text-teal-1 flex items-center gap-1"><Spinner size="sm" /> RUNNING</span>;
}
