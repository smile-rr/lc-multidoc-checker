import React from 'react';

export function LockSummaryPanel({ locked, lockedAt, lockedBy, needTriage, genuineCount, parseErrorCount, onUnlockClick }) {
  const triageDone = needTriage === 0;
  const cls = locked
    ? 'border-teal-1 bg-status-greenSoft'
    : triageDone ? 'border-navy-1 bg-white' : 'border-status-gold bg-status-goldSoft';
  return (
    <div className={`mt-5 border rounded-[10px] p-4 ${cls}`}>
      <div className="flex items-start gap-3">
        <span className="text-[16px] mt-0.5">
          {locked ? '🔒' : triageDone ? '✓' : '⚠'}
        </span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold mb-1">
            {locked
              ? 'Dataset locked · ready for examination'
              : triageDone ? 'All discrepancies triaged · ready to lock'
              : 'Triage required before locking'}
          </div>
          <div className="text-[11px] text-navy-1">
            {locked
              ? `Parsed fields and reconciliation are immutable. Locked at ${lockedAt ?? 'just now'} by ${lockedBy ?? 'officer'}.`
              : triageDone
              ? 'Locking will freeze parsed values and triage decisions. Genuine discrepancies carry forward to examination.'
              : `Each discrepancy and tolerance variance must be classified as genuine or parse error. ${needTriage} row${needTriage === 1 ? '' : 's'} remaining.`}
          </div>
          {!locked && (
            <div className="text-[10px] mt-2 flex items-center gap-3 font-mono">
              <span className="text-status-red">{genuineCount} genuine</span>
              <span className="text-status-blue">{parseErrorCount} parse error{parseErrorCount === 1 ? '' : 's'}</span>
              <span className="text-status-gold">{needTriage} pending</span>
            </div>
          )}
          {locked && onUnlockClick && (
            <div className="mt-2">
              <button
                onClick={onUnlockClick}
                className="text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-slate2 text-muted font-mono"
              >
                🔓 Unlock dataset…
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
