import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useSse } from '../hooks/useSse';
import { useSignoff } from '../hooks/useSignoff';
import { useSessionStatus } from '../context/SessionStatusContext';
import { useDevMode } from '../context/DevModeContext';
import { SessionStatusBar } from '../components/shell/SessionStatusBar';
import { UploadPanel }    from '../components/stages/UploadPanel';
import { IntakePanel }    from '../components/stages/IntakePanel';
import { ParsePanel }     from '../components/stages/ParsePanel';
import { ExaminePanel }   from '../components/stages/ExaminePanel';
import { SignoffPanel }   from '../components/stages/SignoffPanel';
import { Spinner } from '../components/shared/Spinner';
import { runStage } from '../api';
import { OFFICER_ID } from '../lib/officer';
import {
  BACKEND_STAGE_ORDER,
  landingStageForNext,
  stageLabel,
} from '../constants/pipelineStages';
import { isLcReady } from '../lib/sessionGates';

export function SessionPage() {
  const { id } = useParams();
  const { session, loading, error, refresh } = useSession(id);
  const {
    events, stagesCompleted, ruleResults, sessionCompleted,
    officerActions, signedOff, cancelled, currentActivity, stagesRerun,
  } = useSse(id);
  const { setRunningInfo, setEventCount } = useSessionStatus();
  const { enabled: devMode } = useDevMode();

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

  const docConsensusCount = useMemo(
    () => events.filter(e =>
      e?.type === 'ExtractionProgress'
      && e?.data?.slot === 'consensus'
      && /^(HIGH|MED|LOW|failed_all_slots|failed:)/.test(String(e?.data?.status || ''))
    ).length,
    [events]
  );
  useEffect(() => {
    if (docConsensusCount > 0) refresh();
  }, [docConsensusCount, refresh]);

  // ── Gates ──────────────────────────────────────────────────────────────
  const docs = session?.documents ?? [];
  const lcPresent = isLcReady(session, docs);
  const allConfirmed = docs.every(d => d.doc_type !== 'UNKNOWN' && d.confirmed_by_officer !== false);
  const segmentationGate = lcPresent && allConfirmed;

  const parseDocs = docs.filter(d => d.doc_type !== 'UNKNOWN' && d.doc_type !== 'LC');
  const allReviewed = parseDocs.length > 0 && parseDocs.every(d => d.parse_status === 'REVIEWED');
  const parseGate = allReviewed;

  const complianceGate = !!stagesCompleted?.has('compliance-check');
  const signoffGate = !!signoffData?.signed;

  const effectiveCompleted = useMemo(() => {
    const out = new Set(stagesCompleted);
    const raw = session?.stage_completed_at;
    if (raw) {
      try {
        const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const k of Object.keys(m || {})) {
          if (k !== 'reconcile') out.add(k);
        }
      } catch { /* ignore malformed */ }
    }
    if (signoffGate) out.add('signoff');
    return out;
  }, [stagesCompleted, session?.stage_completed_at, signoffGate]);

  const reachable = useMemo(() => {
    const all = new Set(BACKEND_STAGE_ORDER);
    if (devMode) return all;
    if (signoffGate) return all;
    const r = new Set(['upload', 'segmentation']);
    if (segmentationGate) r.add('parse');
    if (segmentationGate && parseGate) r.add('compliance-check');
    if (segmentationGate && parseGate && complianceGate) r.add('signoff');
    return r;
  }, [devMode, signoffGate, segmentationGate, parseGate, complianceGate]);

  const landingTarget = useMemo(() => {
    if (signoffData?.signed) return 'signoff';
    if (session?.awaiting_officer && session?.next_stage) {
      return landingStageForNext(session.next_stage);
    }
    const s = String(session?.status || '').toLowerCase();
    if (s === 'reconcile') return 'parse';
    if (s === 'upload' || s === 'queued') return 'segmentation';
    if (BACKEND_STAGE_ORDER.includes(s)) return s;
    return 'segmentation';
  }, [session?.awaiting_officer, session?.next_stage, session?.status, signoffData?.signed]);

  // Upload auto-chains to segmentation — keep the officer on Segmentation view.
  useEffect(() => {
    if (activeStage === 'upload' && session?.status !== 'UPLOAD') {
      setActiveStage('segmentation');
    }
  }, [activeStage, session?.status]);

  useEffect(() => {
    if (activeStage !== null) return;
    if (!session) return;
    if (signoffData === null) return;
    setActiveStage(landingTarget);
  }, [activeStage, session, signoffData, landingTarget]);

  const goNext = async () => {
    const i = BACKEND_STAGE_ORDER.indexOf(activeStage);
    if (i < 0 || i >= BACKEND_STAGE_ORDER.length - 1) return;
    const next = BACKEND_STAGE_ORDER[i + 1];

    if (stagesCompleted?.has?.(next)) { setActiveStage(next); return; }

    let s = session;
    const isReady = (x) => {
      const ns = x?.next_stage?.toLowerCase();
      return x?.awaiting_officer && ns === next;
    };
    for (let attempt = 0; attempt < 12 && !isReady(s); attempt++) {
      await new Promise(r => setTimeout(r, 500));
      s = await refresh();
    }

    if (!isReady(s)) {
      console.warn('goNext: backend not awaiting', next, 'after 6s', s);
      alert(
          `Cannot advance to ${stageLabel(next)}: the previous stage is still running or ` +
          `has not yet emitted its completion event. Wait a moment and try again.`);
      return;
    }

    try {
      await runStage(id, next, OFFICER_ID);
      await refresh();
      setActiveStage(next);
    } catch (e) {
      console.error('runStage failed', e);
      alert(`Failed to start ${stageLabel(next)}: ${e.message ?? e}`);
    }
  };

  const goBack = () => {
    const i = BACKEND_STAGE_ORDER.indexOf(activeStage);
    if (i > 0) setActiveStage(BACKEND_STAGE_ORDER[i - 1]);
  };

  const handleStageSelect = (key) => {
    setActiveStage(key);
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
        onSelect={handleStageSelect}
        events={events}
        sessionId={id}
        docCount={session?.doc_count}
        sessionStatus={sessionCompleted ? 'COMPLETED' : (session?.status ?? 'RUNNING')}
        compliant={session?.compliant}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeStage === 'upload'            && <UploadPanel   {...props} sessionId={id} />}
        {activeStage === 'segmentation'     && <IntakePanel  {...props} onContinue={goNext} />}
        {activeStage === 'parse'            && <ParsePanel   {...props} onContinue={goNext} />}
        {activeStage === 'compliance-check' && <ExaminePanel {...props} onContinue={goNext} onBack={goBack} />}
        {activeStage === 'signoff' && <SignoffPanel {...props} onBack={goBack} />}
      </div>
    </div>
  );
}
