import React, { useMemo, useState } from 'react';

/**
 * One-line live activity strip + expandable last-N history popover.
 *
 * Props:
 *   events     — array from useSse().events (in order)
 *   filter     — predicate (msg) => boolean to pick relevant event types
 *   maxHistory — how many recent matched events to keep (default 8)
 *   formatter  — (msg) => string for display; default uses msg.type + msg.data
 *   active     — boolean, when false the dot stops pulsing
 *   prefix     — optional label shown before the activity text
 */
export function ActivityStrip({ events, filter, maxHistory = 8, formatter, active, prefix }) {
  const [open, setOpen] = useState(false);
  const matched = useMemo(() => {
    const all = (events || []).filter(filter);
    return all.slice(Math.max(0, all.length - maxHistory));
  }, [events, filter, maxHistory]);

  const latest = matched.length === 0 ? null : matched[matched.length - 1];
  const renderText = (msg) => formatter ? formatter(msg) : defaultFormatter(msg);

  return (
    <div className="relative border border-line rounded-[6px] bg-slate2 px-3 py-1.5 text-[11px] flex items-center gap-2 font-mono">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-teal-1 animate-pulse' : 'bg-line'}`}
        aria-hidden
      />
      {prefix && <span className="text-muted flex-shrink-0">{prefix}</span>}
      <span className="flex-1 truncate text-navy-1">
        {latest ? renderText(latest) : <span className="text-[#a1a1a6]">idle</span>}
      </span>
      {matched.length > 1 && (
        <button
          onClick={() => setOpen(o => !o)}
          className="text-[10px] text-muted hover:text-navy-1 flex-shrink-0"
        >
          {open ? '▴ hide history' : `▾ history (${matched.length})`}
        </button>
      )}
      {open && matched.length > 1 && (
        <div className="absolute z-30 top-full right-0 mt-1 w-96 bg-white border border-line rounded shadow-lg p-2 space-y-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">History</span>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] text-muted hover:text-navy-1 px-1"
              aria-label="Close history"
            >
              ✕
            </button>
          </div>
          {matched.slice().reverse().map((m, i) => (
            <div key={i} className="text-[10px] text-muted truncate">
              <span className="text-[#a1a1a6] mr-1">{tsHHMMSS(m.ts)}</span>
              {renderText(m)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function defaultFormatter(msg) {
  if (!msg) return '';
  switch (msg.type) {
    case 'ExtractionProgress':
      return `${msg.data.docType} · ${msg.data.slot} · ${msg.data.status}`;
    case 'RuleStarted':
      return `Rule ${msg.data.index}/${msg.data.total} · ${msg.data.ruleId} (${msg.data.checkType})`;
    case 'RuleChecked':
      return `${msg.data.ruleId} → ${msg.data.verdict}`;
    case 'StageStarted':
      return `${msg.data.stageName} started`;
    case 'StageCompleted':
      return `${msg.data.stageName} complete`;
    case 'StageRerun':
      return `↻ Re-running from ${msg.data.fromStage}`;
    case 'SessionCancelled':
      return `Cancelled at ${msg.data.atStage}`;
    default:
      return msg.type;
  }
}

function tsHHMMSS(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8);
  } catch { return ''; }
}
