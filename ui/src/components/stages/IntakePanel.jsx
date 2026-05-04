import React, { useEffect, useMemo } from 'react';
import { StageProgressMeter } from '../shared/StageProgressMeter';
import { useStageProgress } from '../../hooks/useStageProgress';
import { useDevMode } from '../../context/DevModeContext';
import { useDocActions } from '../../hooks/useDocActions';
import { useLcRequiredDocs } from '../../hooks/useLcRequiredDocs';
import { ConfirmedTile } from './intake/ConfirmedTile';
import { ReviewTile } from './intake/ReviewTile';
import { RequiredDocChecklist } from './intake/RequiredDocChecklist';
import { OFFICER_ID } from '../../lib/officer';
import { sortByDocType } from '../../constants/docTypes';
import { StagePage, StageBody } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { PageContainer } from '../ui/PageContainer';
import { EyebrowLabel } from '../ui/EyebrowLabel';
import { EmptyState } from '../ui/EmptyState';
import { DevShortcutButton } from '../ui/Button';

/**
 * Stage 0 — Intake. Tiles + LC required-doc checklist + officer type confirmation.
 * Continue gate: LC present + all UNKNOWN/unconfirmed handled + required docs all present.
 * DEV MODE bypasses the gate and exposes "Confirm all suggested" button.
 */
export function IntakePanel({ session, stagesCompleted, events, refresh, onContinue }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;
  const docs = session?.documents ?? [];
  const { setType, confirm } = useDocActions(sessionId);
  const { data: required, refresh: refreshRequired } = useLcRequiredDocs(sessionId);

  // Stage is actively running iff backend status is INTAKE.
  // Pre-stage / post-stage / awaiting-officer all show static state, no spinner.
  const running = session?.status === 'INTAKE';
  const intakeDone = stagesCompleted?.has('intake') || session?.next_stage === 'parse';
  const progress = useStageProgress(events, 'intake', session?.status, intakeDone);

  // When intake completes, the LC :46A: required-doc list becomes available.
  // Pull it without requiring the officer to interact with anything.
  useEffect(() => { if (intakeDone) refreshRequired?.(); }, [intakeDone, refreshRequired]);

  const reviewNeeded = useMemo(() =>
    sortByDocType(docs.filter(d => d.doc_type === 'UNKNOWN' || d.confirmed_by_officer === false)), [docs]);
  const confirmed = useMemo(() =>
    sortByDocType(docs.filter(d => d.doc_type !== 'UNKNOWN' && d.confirmed_by_officer !== false)), [docs]);

  const lcPresent = docs.some(d => d.doc_type === 'LC');
  const allConfirmed = reviewNeeded.length === 0;
  const requiredPresent = (required?.required ?? []).every(r => r.present);
  const canContinue = devMode || (lcPresent && allConfirmed && requiredPresent);

  const blockers = [];
  if (!lcPresent) blockers.push('Add a Letter of Credit (MT700)');
  if (!allConfirmed) blockers.push(`Confirm types on ${reviewNeeded.length} flagged document${reviewNeeded.length > 1 ? 's' : ''}`);
  if (lcPresent && !requiredPresent) blockers.push('Provide all required documents per LC :46A:');

  const handleSetType = async (docId, newType) => {
    await setType(docId, newType, OFFICER_ID);
    await refresh?.();
    await refreshRequired?.();
  };
  const handleConfirm = async (docId) => {
    await confirm(docId, OFFICER_ID);
    await refresh?.();
  };
  const handleConfirmAll = async () => {
    for (const d of reviewNeeded) {
      if (d.doc_type !== 'UNKNOWN') await confirm(d.id, OFFICER_ID);
    }
    await refresh?.();
  };

  return (
    <StagePage>
      <StageToolbar
        title="Document Intake"
        meta={running ? (
          <StageProgressMeter
            {...progress}
            sub={progress.sub || `classifying ${docs.length} doc${docs.length === 1 ? '' : 's'}`}
          />
        ) : (
          <span className="text-[11px] text-muted font-mono">
            {docs.length} doc{docs.length === 1 ? '' : 's'} classified · awaiting confirmation
          </span>
        )}
        actions={
          <>
            {devMode && reviewNeeded.length > 0 && (
              <DevShortcutButton onClick={handleConfirmAll}>⚡ Confirm all suggested</DevShortcutButton>
            )}
            <StageNavButtons
              stage="intake"
              onContinue={onContinue}
              canContinue={canContinue}
              blockers={blockers}
            />
          </>
        }
      />

      <StageBody tone="slate" className="px-6 py-6">
        <PageContainer className="space-y-5">

          {lcPresent ? (
            <RequiredDocChecklist required={required?.required ?? []} />
          ) : (
            <EmptyState dense>
              <EyebrowLabel className="block mb-2">Required-doc checklist</EyebrowLabel>
              Add a Letter of Credit (MT700) to populate the checklist from field :46A:.
            </EmptyState>
          )}

          {docs.length === 0 && running && (
            <EmptyState>Waiting for the pipeline to classify uploaded documents…</EmptyState>
          )}

          {reviewNeeded.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className="w-5 h-5 rounded-full bg-status-gold text-white text-[11px] font-bold flex items-center justify-center">!</span>
                <span className="text-[12px] font-semibold tracking-tight text-status-gold">
                  {reviewNeeded.length} document{reviewNeeded.length > 1 ? 's' : ''} need{reviewNeeded.length === 1 ? 's' : ''} confirmation
                </span>
                <span className="text-[10px] text-status-gold font-mono">blocks Continue</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {reviewNeeded.map((d, i) => (
                  <ReviewTile
                    key={d.id}
                    doc={d}
                    idx={i + 1}
                    total={reviewNeeded.length}
                    onConfirm={handleConfirm}
                    onTypeChange={handleSetType}
                  />
                ))}
              </div>
            </div>
          )}

          {confirmed.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <EyebrowLabel>CONFIRMED · {confirmed.length}</EyebrowLabel>
                {reviewNeeded.length === 0 && docs.length > 0 && (
                  <span className="text-[11px] text-status-green flex items-center gap-1 font-mono">
                    ✓ all classified
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {confirmed.map(d => (
                  <ConfirmedTile key={d.id} doc={d} onTypeChange={handleSetType} />
                ))}
              </div>
            </div>
          )}

          {!canContinue && !devMode && blockers.length > 0 && (
            <div className="bg-status-goldSoft border border-status-gold/40 rounded-[10px] px-4 py-3 text-[12px] text-status-gold">
              <div className="font-semibold mb-1">Before continuing</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}

        </PageContainer>
      </StageBody>
    </StagePage>
  );
}
