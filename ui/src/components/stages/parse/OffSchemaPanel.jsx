import React from 'react';

/**
 * Off-schema items — raw verbatim quote, plus one thin label combining
 * `value` (extractor's short label) and `location` so officers can locate
 * the item on the doc.
 */
export function OffSchemaPanel({ items }) {
  if (!items || items.length === 0) {
    return <div className="p-4 text-[11px] text-muted">No off-schema content detected on this document.</div>;
  }
  return (
    <div className="flex-1 overflow-auto">
      {items.map((it, i) => {
        const raw = it.rawQuote ?? it.raw_quote ?? '';
        const label = [it.value, it.location].filter(Boolean).join(' · ');
        return (
          <div key={i} className="px-4 py-3 border-b border-line/50">
            <div className="font-mono text-[12px] text-navy-1 whitespace-pre-wrap break-words leading-snug">
              {raw || <em className="text-muted">— no raw text —</em>}
            </div>
            {label && (
              <div className="mt-1 text-[10px] text-muted italic tracking-wide">
                {label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
