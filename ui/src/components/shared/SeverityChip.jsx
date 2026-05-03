import React from 'react';

const META = {
  CRITICAL:    { c: '#cc0011', bg: '#fff1f0' },
  MAJOR:       { c: '#cc0011', bg: '#fff1f0' },
  MINOR:       { c: '#8a5700', bg: '#fefce8' },
  OBSERVATION: { c: '#0066cc', bg: '#eff6ff' },
};

export function SeverityChip({ severity }) {
  if (!severity || severity === '—') return null;
  const m = META[severity] || { c: '#6e6e73', bg: '#f5f5f7' };
  return (
    <span
      className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
      style={{ color: m.c, background: m.bg }}
    >
      {severity}
    </span>
  );
}
