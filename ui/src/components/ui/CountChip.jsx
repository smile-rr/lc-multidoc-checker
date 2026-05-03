import React from 'react';

/** Inline mono `{n} {unit}` chip. */
export function CountChip({ n, unit, className = '' }) {
  if (n == null) return null;
  return (
    <span className={`text-[11px] font-mono text-muted shrink-0 ${className}`}>
      {n} {unit}
    </span>
  );
}
