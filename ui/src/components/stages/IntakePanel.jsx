import React, { useMemo } from 'react';
import { Spinner } from '../shared/Spinner';
import { useDevMode } from '../../context/DevModeContext';
import { useDocActions } from '../../hooks/useDocActions';
import { useLcRequiredDocs } from '../../hooks/useLcRequiredDocs';
import { ConfirmedTile } from './intake/ConfirmedTile';
import { ReviewTile } from './intake/ReviewTile';
import { RequiredDocChecklist } from './intake/RequiredDocChecklist';
import { BeforeContinuingPanel } from './intake/BeforeContinuingPanel';

const OFFICER_ID = 'A. Wijaya';

/**
 * Stage 1 — Intake. Tile layout + RequiredDocChecklist + officer type confirmation.
 * Continue gate: LC present + all UNKNOWN/unconfirmed handled + required docs all present.
 * DEV MODE bypasses the gate and exposes "Confirm all" + "Mark all confirmed" buttons.
 */
export function IntakePanel({ session, stagesCompleted, refresh, onContinue }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;
  const docs = session?.documents ?? [];
  const { setType, confirm } = useDocActions(sessionId);
  const { data: required, refresh: refreshRequired } = useLcRequiredDocs(sessionId);

  const intakeDone = stagesCompleted?.has('intake');
  const running = !intakeDone;

  // Officer confirmation status: UNKNOWN docs OR rows with confirmed_by_officer=false
  // until intake stage has had a chance to mark them. We treat HIGH-confidence
  // (filename matched a known keyword) as auto-confirmed.
  const reviewNeeded = useMemo(() =>
    docs.filter(d =>
      d.doc_type === 'UNKNOWN' || d.confirmed_by_officer === false
    ), [docs]);
  const confirmed = useMemo(() =>
    docs.filter(d =>
      d.doc_type !== 'UNKNOWN' && d.confirmed_by_officer !== false
    ), [docs]);

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
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">STAGE 0</div>
          <h1 className="text-[22px] font-semibold tracking-tight">Document Intake</h1>
          <div className="text-[12px] text-muted mt-1 font-mono flex items-center gap-2">
            {running ? (
              <><Spinner size="sm" /> classifying… ({docs.length} so far)</>
            ) : (
              <>Pipeline classified {docs.length} doc{docs.length === 1 ? '' : 's'} — confirm or correct each type before continuing</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {devMode && reviewNeeded.length > 0 && (
            <button
              onClick={handleConfirmAll}
              className="text-[11px] px-3 py-1.5 rounded-[6px] bg-status-gold text-white hover:bg-status-gold/80"
              title="DEV: confirm all suggested types"
            >
              ⚡ Confirm all suggested
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className={`px-4 py-2 rounded-[8px] text-[13px] flex items-center gap-2
              ${canContinue
                ? 'bg-navy-1 text-white hover:bg-navy-2'
                : 'bg-line text-muted cursor-not-allowed'}`}
            title={canContinue ? '' : blockers.join(' · ')}
          >
            Continue to Parse →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        <div>
          {docs.length === 0 && running && (
            <div className="border-2 border-dashed rounded-[10px] p-8 text-center border-line bg-white">
              <div className="text-[14px] text-muted">Waiting for the pipeline to classify uploaded documents…</div>
            </div>
          )}

          {reviewNeeded.length > 0 && (
            <div className="mt-1">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-status-gold text-white text-[11px] font-bold flex items-center justify-center">!</span>
                  <span className="text-[12px] font-semibold tracking-tight text-status-gold">
                    {reviewNeeded.length} document{reviewNeeded.length > 1 ? 's' : ''} need{reviewNeeded.length === 1 ? 's' : ''} confirmation
                  </span>
                  <span className="text-[10px] text-status-gold font-mono">blocks Continue</span>
                </div>
              </div>
              <div className="space-y-3">
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
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">
                  CONFIRMED · {confirmed.length}
                </span>
                {reviewNeeded.length === 0 && docs.length > 0 && (
                  <span className="text-[11px] text-status-green flex items-center gap-1 font-mono">
                    ✓ all classified
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {confirmed.map(d => (
                  <ConfirmedTile key={d.id} doc={d} onTypeChange={handleSetType} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {lcPresent ? (
            <RequiredDocChecklist required={required?.required ?? []} />
          ) : (
            <div className="border border-dashed border-line rounded-[10px] p-5 text-[12px] text-muted bg-white">
              <div className="text-[10px] tracking-[0.2em] uppercase text-[#a1a1a6] mb-2 font-mono">
                REQUIRED-DOC CHECKLIST
              </div>
              Add a Letter of Credit (MT700) to populate the checklist from field :46A:.
            </div>
          )}
          {!devMode && <BeforeContinuingPanel items={blockers} />}
        </div>
      </div>
    </div>
  );
}
