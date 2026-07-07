import React from 'react';
import { PrimaryButton, SecondaryButton } from './Button';
import { stageLabel, nextBackendStage, prevBackendStage } from '../../constants/pipelineStages';

/**
 * Single Continue/Back pair. Labels derived from stage order so they stay in sync.
 * `onContinue` / `onBack` may be undefined — the corresponding button is hidden.
 */
export function StageNavButtons({ stage, onBack, onContinue, canContinue = true, continueLabel, continueTone = 'primary', blockers }) {
  const next = nextBackendStage(stage);
  const prev = prevBackendStage(stage);

  return (
    <div className="flex items-center gap-2">
      {onBack && prev && (
        <SecondaryButton onClick={onBack}>← {stageLabel(prev)}</SecondaryButton>
      )}
      {onContinue && next && (
        <PrimaryButton
          tone={continueTone}
          onClick={onContinue}
          disabled={!canContinue}
          title={!canContinue && blockers?.length ? blockers.join(' · ') : ''}
        >
          {continueLabel ?? `${stageLabel(next)} →`}
        </PrimaryButton>
      )}
    </div>
  );
}
