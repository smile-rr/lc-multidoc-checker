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

/** DEV-only re-run button. Shows a confirm dialog; calls POST /stages/{stage}/rerun. */
export function RerunButton({ sessionId, stage, devMode, disabled }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  if (!devMode) return null;
  const label = STAGE_LABELS[stage] || stage;

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

  return (
    <>
      <button
        onClick={onClick}
        disabled={running || disabled}
        title={`DEV: re-run pipeline from ${label} stage onwards`}
        className="text-[11px] px-3 py-1.5 rounded-[6px] bg-status-gold/15 border border-status-gold text-status-gold hover:bg-status-gold/25 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? '↻ requesting…' : `⚡ Re-run from ${label}`}
      </button>
      {error && (
        <span className="text-[10px] text-status-red font-mono">{error}</span>
      )}
    </>
  );
}
