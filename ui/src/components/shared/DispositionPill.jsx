import React from 'react';

const META = {
  PENDING: { c: '#6e6e73', bg: '#f5f5f7', l: 'PENDING' },
  WAIVER:  { c: '#0066cc', bg: '#eff6ff', l: 'WAIVER REQUESTED' },
  CURED:   { c: '#1a7a43', bg: '#f0fdf4', l: 'CURED' },
  HOLD:    { c: '#8a5700', bg: '#fefce8', l: 'HOLD' },
  REFUSE:  { c: '#cc0011', bg: '#fff1f0', l: 'REFUSE' },
  ACCEPT:  { c: '#1a7a43', bg: '#f0fdf4', l: 'ACCEPT AS-IS' },
};

export function DispositionPill({ d }) {
  const m = META[d] || { c: '#6e6e73', bg: '#f5f5f7', l: d };
  return (
    <span
      className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
      style={{ color: m.c, background: m.bg }}
    >
      {m.l}
    </span>
  );
}
