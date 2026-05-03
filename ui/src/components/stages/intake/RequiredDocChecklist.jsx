import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';

/** Right-rail "Required per LC :46A:" checklist. */
export function RequiredDocChecklist({ required }) {
  const items = required ?? [];
  const have = items.filter(r => r.present).length;

  return (
    <div className="border border-line rounded-[10px] bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted font-mono">
            REQUIRED PER LC :46A:
          </div>
          <div className="text-[12px] text-navy-1 mt-0.5">
            Derived from MT700 field 46A
          </div>
        </div>
        <div className="text-[11px] text-muted font-mono">
          {have}/{items.length} provided
        </div>
      </div>
      {items.length === 0 && (
        <div className="text-[11px] text-muted italic">
          No documents required (or :46A: was empty/unparseable).
        </div>
      )}
      <div className="space-y-1.5">
        {items.map(r => {
          const t = docTypeMeta(r.type);
          const cls = r.present
            ? 'bg-status-green text-white'
            : 'bg-status-red text-white';
          return (
            <div key={r.type} className="flex items-center gap-3 text-[12px] py-1">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${cls}`}
              >
                {r.present ? '✓' : '!'}
              </span>
              <span className="text-[10px] uppercase tracking-wider w-12 font-mono" style={{ color: t.color }}>
                {t.short}
              </span>
              <span className={r.present ? 'text-navy-1' : 'text-status-red font-medium'}>
                {r.label || t.name}
              </span>
              <span className="text-[11px] text-muted ml-auto font-mono">{r.copies || ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
