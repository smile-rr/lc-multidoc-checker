import React, { useState } from 'react';
import { ConfChip } from '../../shared/ConfChip';

/**
 * One field row. Shows label, value (consensus), confidence chip, agreement chip,
 * +compare expand (when slot values differ), and a ✎ correct button.
 */
export function FieldRow({ label, fieldKey, value, conf, manual, slotValues, onCorrect, reviewed }) {
  const [expanded, setExpanded] = useState(false);
  const slots = slotValues ?? {};
  const slotIds = Object.keys(slots);
  const slotsDisagree = slotIds.length > 1
    && slotIds.some(s => String(slots[s]) !== String(value));
  // "Needs attention" = slots disagree AND officer hasn't acted on it.
  // Acting on it means either a manual correction OR marking the doc reviewed
  // (review = officer accepted the consensus). Both collapse the gold tone
  // into the calm "decided" blue.
  const decided = manual || reviewed;
  const needsAttention = slotsDisagree && !decided;
  const tone = decided
    ? (slotsDisagree ? 'bg-status-blueSoft/30' : '')   // calm, decided
    : slotsDisagree ? 'bg-status-goldSoft' : '';
  return (
    <div className={`px-4 py-2.5 border-b border-line/50 ${tone}`}>
      <div className="grid grid-cols-[160px_1fr_auto] gap-3 items-baseline">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-navy-1" title={fieldKey}>{label}</span>
          {manual && (
            <span
              className="text-[9px] px-1 rounded bg-status-blue text-white font-mono"
              title="Officer-corrected"
            >
              ✎ edited
            </span>
          )}
        </div>
        <div className="text-[12px] font-mono break-words min-w-0">{String(value ?? '—')}</div>
        <div className="flex items-center gap-1.5">
          <ConfChip conf={conf} />
          {!slotsDisagree && slotIds.length > 1 && (
            <span className="text-[8px] tracking-wider px-1 py-0.5 rounded bg-teal-1/10 text-teal-1 font-mono">
              {slotIds.length}✓
            </span>
          )}
          {slotsDisagree && (
            <button
              onClick={() => setExpanded(e => !e)}
              className={`text-[9px] px-1.5 py-0.5 rounded border font-mono transition-colors ${
                needsAttention
                  ? 'border-status-gold text-status-gold hover:bg-status-goldSoft'
                  : 'border-line text-muted hover:bg-slate2'
              }`}
              title={needsAttention ? 'Slots disagree — review' : 'Slots disagreed before edit — inspect'}
            >
              {expanded ? '−' : '+'} compare
            </button>
          )}
          <button
            onClick={onCorrect}
            className="text-[9px] px-1 text-[#a1a1a6] hover:text-status-blue"
            title="Manual correct"
          >
            ✎ correct
          </button>
        </div>
      </div>
      {expanded && conflict && (
        <div className="mt-2 ml-[176px] grid gap-2" style={{ gridTemplateColumns: `repeat(${slotIds.length}, minmax(0, 1fr))` }}>
          {slotIds.map(slot => {
            const v = String(slots[slot] ?? '—');
            const isConsensus = v === String(value);
            return (
              <div
                key={slot}
                className={`p-2 border rounded text-[10px] ${isConsensus ? 'border-teal-1 bg-status-greenSoft' : 'border-line'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono tracking-wider text-[9px]" style={{ color: isConsensus ? '#0a7e6a' : '#6e6e73' }}>
                    {slot}
                  </span>
                </div>
                <div className="text-[10px] font-mono break-words">{v}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
