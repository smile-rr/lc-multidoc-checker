import React from 'react';

/** Dashed-bordered empty/placeholder panel. */
export function EmptyState({ children, className = '', dense = false }) {
  return (
    <div className={`border-2 border-dashed border-line rounded-[10px] bg-white text-center text-muted ${dense ? 'p-4 text-[12px]' : 'p-8 text-sm'} ${className}`}>
      {children}
    </div>
  );
}
