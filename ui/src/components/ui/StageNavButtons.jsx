import React from 'react';
import { PrimaryButton, SecondaryButton } from './Button';

const STAGE_LABELS = {
  intake:    'Intake',
  parse:     'Parse',
  reconcile: 'Reconcile',
  examine:   'Examine',
  signoff:   'Sign-off',
};
const ORDER = ['intake', 'parse', 'reconcile', 'examine', 'signoff'];

/**
 * Single Continue/Back pair. Labels derived from stage order so they stay in sync.
 * `onContinue` / `onBack` may be undefined — the corresponding button is hidden.
 */
export function StageNavButtons({ stage, onBack, onContinue, canContinue = true, continueLabel, continueTone = 'primary', blockers }) {
  const i = ORDER.indexOf(stage);
  const next = i >= 0 && i < ORDER.length - 1 ? STAGE_LABELS[ORDER[i + 1]] : null;
  const prev = i > 0 ? STAGE_LABELS[ORDER[i - 1]] : null;

  return (
    <div className="flex items-center gap-2">
      {onBack && prev && (
        <SecondaryButton onClick={onBack}>← {prev}</SecondaryButton>
      )}
      {onContinue && next && (
        <PrimaryButton
          tone={continueTone}
          onClick={onContinue}
          disabled={!canContinue}
          title={!canContinue && blockers?.length ? blockers.join(' · ') : ''}
        >
          {continueLabel ?? `${next} →`}
        </PrimaryButton>
      )}
    </div>
  );
}
