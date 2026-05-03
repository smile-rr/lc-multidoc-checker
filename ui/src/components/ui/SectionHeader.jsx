import React from 'react';
import { EyebrowLabel } from './EyebrowLabel';

/**
 * Section header: eyebrow [count] right-side actions.
 * Standard rhythm under a Card or above a list.
 */
export function SectionHeader({ eyebrow, eyebrowTone = 'muted', count, title, actions, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        {eyebrow && (
          <EyebrowLabel tone={eyebrowTone}>
            {eyebrow}{count != null ? ` · ${count}` : ''}
          </EyebrowLabel>
        )}
        {title && <span className="text-[12px] font-semibold tracking-tight truncate">{title}</span>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
