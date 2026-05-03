import React, { useState } from 'react';
import { rerunStage } from '../../api';
import { OFFICER_ID } from '../../lib/officer';

const STAGE_LABELS = {
  intake:    'Intake',
  parse:     'Parse',
  reconcile: 'Reconcile',
  examine:   'Examine',
  signoff:   'Sign-off',
};
const DOWNSTREAM_LABEL = {
  intake:    'discard everything (documents, extraction, reconciliation, examination, sign-off)',
  parse:     'discard extraction, reconciliation, examination, sign-off',
  reconcile: 'discard reconciliation, examination, sign-off',
  examine:   'discard examination, sign-off',
  signoff:   'discard sign-off draft (no other state lost)',
};

/**
 * Re-run from this stage onward. Available in production AND dev:
 * real LC officers need to redo a stage when they spot bad extraction
 * or want a clean second-look. Confirm dialog + downstream-discard hint
 * is the safety net. DEV MODE only changes the styling (gold/loud).
 */
export function RerunButton({ sessionId, stage, devMode, disabled }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const label = STAGE_LABELS[stage] || stage;

  if (!devMode) return null;

  const onClick = async () => {
    if (running || disabled) return;
    const ok = window.confirm(
      `Re-run from ${label}?\n\nThis will ${DOWNSTREAM_LABEL[stage] || 'discard downstream state'}, then replay the pipeline from this stage.`
    );
    if (!ok) return;
    setRunning(true); setError(null);
    try {
      await rerunStage(sessionId, stage, OFFICER_ID);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const cls = devMode
    ? 'text-[11px] px-3 py-1.5 rounded-[6px] bg-status-gold/15 border border-status-gold text-status-gold hover:bg-status-gold/25 disabled:opacity-50 disabled:cursor-not-allowed'
    : 'text-[11px] px-3 py-1.5 rounded-[6px] border border-line text-muted hover:text-navy-1 hover:bg-slate2 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <button
        onClick={onClick}
        disabled={running || disabled}
        title={`Re-run pipeline from ${label} stage onwards`}
        className={cls}
      >
        {running ? '↻ requesting…' : `↻ re-run from ${label}`}
      </button>
      {error && (
        <span className="text-[10px] text-status-red font-mono">{error}</span>
      )}
    </>
  );
}
