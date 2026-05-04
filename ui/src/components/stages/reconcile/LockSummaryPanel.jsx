import React from 'react';

/**
 * Slim docked status bar for the Reconcile stage. Renders as a single fixed-height
 * row so it doesn't eat the matrix's vertical space.
 *
 * States:
 *   locked      → green tint, lock icon + Unlock button (right)
 *   triageDone  → neutral, ✓ ready to lock
 *   pending     → gold tint, ⚠ N pending
 */
export function LockSummaryPanel({ locked, lockedAt, lockedBy, needTriage, genuineCount, parseErrorCount, onUnlockClick }) {
  const triageDone = needTriage === 0;
  const tone = locked
    ? 'border-teal-1 bg-status-greenSoft text-teal-1'
    : triageDone
      ? 'border-line bg-white text-navy-1'
      : 'border-status-gold bg-status-goldSoft text-status-gold';

  return (
    <div className={`shrink-0 border-t ${tone} px-6 py-2 flex items-center gap-4 text-[11px] font-mono`}>
      <span className="text-[14px] leading-none">
        {locked ? '🔒' : triageDone ? '✓' : '⚠'}
      </span>
      <span className="font-semibold">
        {locked
          ? 'Locked'
          : triageDone
            ? 'Ready to lock'
            : 'Triage required'}
      </span>

      {!locked && (
        <span className="flex items-center gap-3">
          <span className="text-status-red"><b>{genuineCount}</b> genuine</span>
          <span className="text-status-blue"><b>{parseErrorCount}</b> parse-error</span>
          <span className="text-status-gold"><b>{needTriage}</b> pending</span>
        </span>
      )}

      {locked && (
        <span className="text-muted">
          by {lockedBy ?? 'officer'} · {lockedAt ?? 'just now'}
        </span>
      )}

      {locked && onUnlockClick && (
        <button
          onClick={onUnlockClick}
          className="ml-auto text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-slate2 text-muted transition-colors"
        >
          🔓 Unlock dataset…
        </button>
      )}
    </div>
  );
}
