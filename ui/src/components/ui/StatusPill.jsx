import React from 'react';
import { statusStyle, TONE_CLASS } from '../../lib/statusStyle';

/** Status chip — pulls colour + label from statusStyle. */
export function StatusPill({ status, compliant, size = 'md', className = '' }) {
  const s = statusStyle(status, compliant);
  if (!s.label) return null;
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span className={`font-mono font-medium rounded shrink-0 ${TONE_CLASS[s.tone]} ${sz} ${className}`}>
      {s.label}
    </span>
  );
}
