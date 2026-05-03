import React from 'react';

/**
 * Standard stage sub-header bar.
 * Left slot: stage title / meta. Right slot: actions (typically Continue/Back/Rerun).
 * Replaces the inline `px-6 py-3 bg-white border-b border-line flex...` repeated 3×.
 */
export function StageToolbar({ title, meta, actions, className = '' }) {
  return (
    <div className={`px-6 py-3 bg-white border-b border-line flex items-center gap-4 shrink-0 ${className}`}>
      <div className="min-w-0 flex items-center gap-3 flex-wrap">
        {title && <div className="text-[15px] font-semibold tracking-tight">{title}</div>}
        {meta}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
