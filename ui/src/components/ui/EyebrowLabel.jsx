import React from 'react';

/** Uppercase tracked mono micro-label used as section eyebrows. */
export function EyebrowLabel({ children, className = '', tone = 'muted' }) {
  const toneClass = tone === 'gold' ? 'text-status-gold'
    : tone === 'red' ? 'text-status-red'
    : tone === 'green' ? 'text-status-green'
    : 'text-muted';
  return (
    <span className={`text-[10px] tracking-[0.2em] uppercase font-mono ${toneClass} ${className}`}>
      {children}
    </span>
  );
}
