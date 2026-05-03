import React from 'react';

/**
 * Horizontal tab strip — bottom-bordered, active gets navy underline.
 * tabs: [{ id, label, count?, badge? }]
 */
export function TabBar({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`flex border-b border-line -mb-px overflow-x-auto ${className}`}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3 py-2 text-[11px] tracking-tight border-b-2 whitespace-nowrap transition-colors
              ${isActive
                ? 'border-navy-1 text-navy-1 font-semibold'
                : 'border-transparent text-muted hover:text-navy-1'}`}
          >
            {t.label}{t.count != null && <span className="ml-1 text-muted/70">({t.count})</span>}
            {t.badge && <span className="ml-1.5">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
