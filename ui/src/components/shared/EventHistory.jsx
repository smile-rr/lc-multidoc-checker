import React, { useMemo, useState } from 'react';

/**
 * Session-level event history button + popover.
 *
 * Shows:  event history (N)
 * On click: popover with all events sorted newest-first (by seq),
 *           a close button in the top-right corner.
 *
 * Props:
 *   events  — array from useSse().events
 *   onFormat — optional (msg) => string formatter for each row
 */
export function EventHistory({ events = [], onFormat }) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)),
    [events]
  );

  function formatRow(msg) {
    if (onFormat) return onFormat(msg);
    const type = msg.type || '';
    const data = msg.data || {};
    const docType = data.docType || '';
    const slot = data.slot || '';
    const status = data.status || '';
    const ruleId = data.ruleId || '';
    const verdict = data.verdict || '';
    const stageName = data.stageName || '';
    if (type === 'ExtractionProgress') return `${docType} · ${slot} · ${status}`;
    if (type === 'RuleStarted') return `Rule ${data.index}/${data.total} · ${ruleId} (${data.checkType})`;
    if (type === 'RuleChecked') return `${ruleId} → ${verdict}`;
    if (type === 'StageStarted') return `${stageName} started`;
    if (type === 'StageCompleted') return `${stageName} complete`;
    if (type === 'StageRerun') return `↻ Re-running from ${data.fromStage}`;
    if (type === 'SessionCancelled') return `Cancelled at ${data.atStage}`;
    if (type === 'SessionCompleted') return `Session complete — compliant=${data.compliant}`;
    if (type === 'DocTypeChanged') return `Doc type → ${data.newType}`;
    if (type === 'DocReviewed') return `Doc reviewed`;
    if (type === 'FieldCorrected') return `Field ${data.fieldKey} corrected`;
    if (type === 'ReconcileTriaged') return `${data.fieldKey} → ${data.decision}`;
    if (type === 'Locked') return `Locked`;
    if (type === 'Unlocked') return `Unlocked`;
    if (type === 'RuleOverridden') return `${ruleId} → ${data.newStatus} (override)`;
    if (type === 'OverrideCleared') return `${ruleId} override cleared`;
    if (type === 'SignedOff') return `Signed off: ${data.decision}`;
    return type;
  }

  function fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(typeof ts === 'number' ? ts : ts);
      return d.toTimeString().slice(0, 8);
    } catch { return ''; }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] text-muted hover:text-navy-1 font-mono px-2 py-1 rounded hover:bg-slate2 transition-colors"
      >
        {events.length} events ▾
      </button>

      {open && (
        <>
          {/* Backdrop — click to close */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-1 z-50 w-[680px] max-w-[90vw] bg-white border border-line rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-slate2">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                Event History · {events.length} total
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[10px] text-muted hover:text-navy-1 px-1"
              >
                ✕ close
              </button>
            </div>

            {/* Column header — clarifies the compact metadata cluster */}
            <div className="flex items-center gap-2 px-3 py-1 border-b border-line bg-slate2/60 text-[9px] font-mono uppercase tracking-wider text-muted">
              <span className="w-[140px] shrink-0">seq · time · type</span>
              <span className="flex-1">description</span>
            </div>

            {/* Event list */}
            <div className="max-h-[60vh] overflow-y-auto">
              {sorted.length === 0 ? (
                <div className="p-4 text-[11px] text-muted text-center">No events yet.</div>
              ) : (
                <div className="divide-y divide-line">
                  {sorted.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate2">
                      {/* Compact metadata: seq · time · type in one tight cluster */}
                      <div className="w-[140px] shrink-0 flex flex-col gap-0 pt-0.5">
                        <span className="text-[10px] font-mono text-[#a1a1a6] truncate">
                          #{msg.seq ?? '—'} · {fmtTs(msg.ts)}
                        </span>
                        <span className="text-[9px] font-mono font-semibold text-muted truncate">
                          {msg.type}
                        </span>
                      </div>
                      {/* Description gets the rest */}
                      <span className="text-[11px] text-navy-1 flex-1 break-words pt-0.5">
                        {formatRow(msg)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
