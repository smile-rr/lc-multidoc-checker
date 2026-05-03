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
    return () => setRunningInfo(null);
  }, [id, session?.status, session?.doc_count, sessionCompleted, events.length, setRunningInfo]);

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

