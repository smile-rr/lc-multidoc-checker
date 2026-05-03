import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';

/**
 * Vertical document navigator. 64px wide.
 *
 * Documents are the primary focus of Parse. The MT700/LC entry is pinned at
 * the top with a navy border (the source-of-truth, never review-gated). The
 * other docs (vision-extracted) follow below with a divider.
 *
 * Each non-LC tile shows a status corner badge encoding parse_status.
 */
export function DocRail({ lcEntry, docs, activeId, onActive }) {
  return (
    <aside className="bg-white border-r border-line overflow-auto flex-shrink-0 flex flex-col" style={{ width: 64 }}>
      <div className="px-2 py-2 border-b border-line">
        <div className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono text-center">
          Docs
        </div>
        <div className="text-[10px] font-mono text-navy-1 text-center mt-0.5">
          {docs.length + (lcEntry ? 1 : 0)}
        </div>
      </div>

      <div className="p-1.5 space-y-1.5 overflow-auto flex-1">
        {/* Pinned MT700 entry — source of truth */}
        {lcEntry && (
          <>
            <button
              onClick={() => onActive(lcEntry.id)}
              title={`MT700 · ${lcEntry.original_filename || 'source'}`}
              className={`w-full py-1.5 rounded-[6px] flex flex-col items-center gap-1 transition relative
                ${activeId === lcEntry.id ? 'bg-slate2' : 'hover:bg-slate2/60'}`}
            >
              {activeId === lcEntry.id && (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-navy-1" />
              )}
              <div className="w-10 h-10 rounded-[6px] flex items-center justify-center text-[12px] font-bold font-mono border-2 border-navy-1 text-navy-1 bg-white">
                LC
              </div>
              <div className="text-[9px] tracking-wider font-semibold font-mono text-navy-1">
                MT700
              </div>
            </button>
            <div className="border-b border-line/60 my-1" />
          </>
        )}

        {docs.map(d => {
          const t = docTypeMeta(d.doc_type);
          const active = d.id === activeId;
          const reviewed = d.parse_status === 'REVIEWED';
          const extracted = d.parse_status === 'EXTRACTED';
          const failed = d.parse_status === 'FAILED';
          const badge = failed
            ? { bg: 'bg-status-red',   icon: '✕' }
            : reviewed
              ? { bg: 'bg-status-green', icon: '✓' }
              : extracted
                ? { bg: 'bg-status-gold',  icon: '!' }
                : null;
          return (
            <button
              key={d.id}
              onClick={() => onActive(d.id)}
              title={`${t.name} · ${d.original_filename || ''}`}
              className={`w-full py-1.5 rounded-[6px] flex flex-col items-center gap-1 transition relative
                ${active ? 'bg-slate2' : 'hover:bg-slate2/60'}`}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-navy-1" />
              )}
              <div
                className="w-10 h-10 rounded-[6px] flex items-center justify-center text-[15px] relative"
                style={{ color: t.color, background: t.color + '18' }}
              >
                {t.icon}
                {badge && (
                  <span className={`absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full ${badge.bg} text-white text-[8px] font-bold flex items-center justify-center`}>
                    {badge.icon}
                  </span>
                )}
              </div>
              <div className="text-[9px] tracking-wider font-semibold font-mono" style={{ color: t.color }}>
                {t.short}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
