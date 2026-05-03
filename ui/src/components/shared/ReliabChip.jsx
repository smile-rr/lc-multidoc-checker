import React from 'react';

/** Color-coded reliability percent. Hidden when reliab is null. */
export function ReliabChip({ r }) {
  if (r === null || r === undefined) return null;
  const c = r >= 90 ? '#1a7a43' : r >= 80 ? '#8a5700' : '#cc0011';
  const bg = r >= 90 ? '#f0fdf4' : r >= 80 ? '#fefce8' : '#fff1f0';
  return (
    <span
      className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
      style={{ color: c, background: bg }}
      title={`Agent reliability over recent population: ${r}%`}
    >
      {r}%
    </span>
  );
}
