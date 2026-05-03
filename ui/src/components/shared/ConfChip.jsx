import React from 'react';

/**
 * Renders nothing for HIGH; amber for MED; red for LOW.
 * Used in Parse field rows + reconcile cells where extraction confidence matters.
 */
export function ConfChip({ conf }) {
  if (!conf || conf === 'HIGH') return null;
  const color = conf === 'MED' ? '#8a5700' : '#cc0011';
  const bg = conf === 'MED' ? '#fefce8' : '#fff1f0';
  return (
    <span
      className="text-[9px] px-1 py-0.5 rounded font-mono"
      style={{ color, background: bg }}
    >
      {conf}
    </span>
  );
}
