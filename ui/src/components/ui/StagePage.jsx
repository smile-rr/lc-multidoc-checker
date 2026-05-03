import React from 'react';

/** Standard stage shell: flex column, full height, min-h-0 so children can scroll. */
export function StagePage({ children, className = '' }) {
  return <div className={`flex flex-col h-full min-h-0 ${className}`}>{children}</div>;
}

/** Scrollable body region inside a StagePage — most stages need this beneath a toolbar. */
export function StageBody({ children, className = '', tone = 'paper' }) {
  const bg = tone === 'slate' ? 'bg-slate2' : tone === 'white' ? 'bg-white' : '';
  return (
    <div className={`flex-1 min-h-0 overflow-auto ${bg} ${className}`}>
      {children}
    </div>
  );
}
