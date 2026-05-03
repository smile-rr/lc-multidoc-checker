import React from 'react';

/** Inline yellow panel listing what blocks Continue. */
export function BeforeContinuingPanel({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 border-l-2 border-status-gold bg-status-goldSoft p-3 text-[11px] text-navy-1">
      <div className="font-semibold mb-1">Before continuing:</div>
      {items.map((label, i) => (
        <div key={i}>· {label}</div>
      ))}
    </div>
  );
}
