import React, { useState } from 'react';
import { rerunStage } from '../../api';
import { OFFICER_ID } from '../../lib/officer';
import { stageLabel, BACKEND_STAGE_ORDER } from '../../constants/pipelineStages';

const DOWNSTREAM_LABEL = {
  upload:             'discard everything (documents, extraction, compliance check, sign-off)',
  segmentation:     'discard segmentation onward (documents, extraction, compliance check, sign-off)',
  parse:            'discard extraction, compliance check, sign-off',
  'compliance-check': 'discard compliance check, sign-off',
  signoff:          'discard sign-off draft (no other state lost)',
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
  const label = stageLabel(stage) || stage;

  if (!devMode) return null;
  if (!BACKEND_STAGE_ORDER.includes(stage)) return null;

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
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={onClick}
        disabled={running || disabled}
        title={`DEV: re-run from ${label}`}
        className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-status-gold/50 text-status-gold hover:bg-status-gold/10 disabled:opacity-40"
      >
        {running ? '↻ running…' : `↻ ${label}`}
      </button>
      {error && <span className="text-[10px] text-status-red">{error}</span>}
    </span>
  );
}
