import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';

/** Vertical filmstrip of docs with status badge + full name + filename hint. */
export function DocRail({ docs, activeId, onActive }) {
  return (
    <aside className="bg-white border-r border-line overflow-auto flex-shrink-0" style={{ width: 156 }}>
      <div className="p-2 space-y-1.5">
        {docs.map(d => {
          const t = docTypeMeta(d.doc_type);
          const active = d.id === activeId;
          const reviewed = d.parse_status === 'REVIEWED';
          const extracted = d.parse_status === 'EXTRACTED';
          const failed = d.parse_status === 'FAILED';
          const ringColor = failed ? '#cc0011'
            : reviewed ? '#0a7e6a'
            : extracted ? '#cc8800' : '#a1a1a6';
          const statusColor = failed ? '#cc0011'
            : reviewed ? '#1a7a43'
            : extracted ? '#8a5700' : '#6e6e73';
          const statusBg = failed ? '#fff1f0'
            : reviewed ? '#f0fdf4'
            : extracted ? '#fefce8' : '#f5f5f7';
          const statusLabel = failed ? '✕ FAILED'
            : reviewed ? '✓ DONE'
            : extracted ? 'REVIEW'
            : 'PENDING';
          return (
            <button
              key={d.id}
              onClick={() => onActive(d.id)}
              className={`w-full p-2 rounded-[8px] flex flex-col items-center gap-1 transition border-2
                ${active ? 'bg-status-greenSoft' : 'hover:bg-slate2'}`}
              style={{ borderColor: active ? '#0a7e6a' : 'transparent' }}
              title={`${t.name} — ${d.original_filename || d.id}${failed ? ' — extraction failed' : ''}`}
            >
              <div
                className="w-12 h-12 rounded-[6px] border-2 flex items-center justify-center text-[18px] relative"
                style={{ borderColor: ringColor, color: t.color, background: t.color + '10' }}
              >
                {t.icon}
                {failed && (
                  <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-status-red text-white text-[10px] flex items-center justify-center">
                    ✕
                  </span>
                )}
                {!failed && reviewed && (
                  <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-status-green text-white text-[10px] flex items-center justify-center">
                    ✓
                  </span>
                )}
                {!failed && !reviewed && extracted && (
                  <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-status-gold text-white text-[9px] font-bold flex items-center justify-center font-mono">
                    !
                  </span>
                )}
              </div>
              <div className="text-[9px] tracking-wider font-semibold font-mono" style={{ color: t.color }}>
                {t.short}
              </div>
              <div
                className="text-[10px] leading-tight font-medium text-center text-navy-1"
                style={{ wordBreak: 'break-word', maxWidth: 138 }}
              >
                {t.name}
              </div>
              {d.original_filename && (
                <div
                  className="text-[8px] text-[#a1a1a6] font-mono w-full text-center"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.original_filename}
                </div>
              )}
              <div
                className="text-[8px] tracking-wider px-1 py-0.5 rounded font-mono"
                style={{ color: statusColor, background: statusBg }}
              >
                {statusLabel}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
