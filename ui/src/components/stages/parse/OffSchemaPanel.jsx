import React from 'react';
import { ConfChip } from '../../shared/ConfChip';

const KIND_META = {
  'handwritten':            { l: 'HANDWRITTEN',           icon: '✍', c: '#8a5700', bg: '#fefce8' },
  'handwritten-note':       { l: 'HANDWRITTEN NOTE',      icon: '✍', c: '#8a5700', bg: '#fefce8' },
  'handwritten-stamp':      { l: 'HANDWRITTEN STAMP',     icon: '✍', c: '#8a5700', bg: '#fefce8' },
  'handwritten-correction': { l: 'HANDWRITTEN CORRECTION', icon: '✍', c: '#cc0011', bg: '#fff1f0' },
  'handwritten-annotation': { l: 'HANDWRITTEN ANNOTATION', icon: '✍', c: '#8a5700', bg: '#fefce8' },
  'stamp':                  { l: 'STAMP / SIGNATURE',     icon: '❒', c: '#0066cc', bg: '#eff6ff' },
  'watermark':              { l: 'WATERMARK',             icon: '◧', c: '#0066cc', bg: '#eff6ff' },
  'correction':             { l: 'CORRECTION',            icon: '✎', c: '#cc0011', bg: '#fff1f0' },
  'free-text':              { l: 'FREE-TEXT BLOCK',       icon: '¶', c: '#6e6e73', bg: '#f5f5f7' },
};

export function OffSchemaPanel({ items }) {
  if (!items || items.length === 0) {
    return <div className="p-4 text-[11px] text-muted">No off-schema content detected on this document.</div>;
  }
  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-3 bg-slate2 border-b border-line/50 text-[11px] text-muted">
        Content found on the page that isn't in the predefined field schema —
        handwritten notes, stamps, free-text remarks. Captured for the audit trail.
      </div>
      {items.map((it, i) => {
        const m = KIND_META[it.kind] || { l: String(it.kind || 'OFF-SCHEMA').toUpperCase(), icon: '·', c: '#6e6e73', bg: '#f5f5f7' };
        return (
          <div key={i} className="px-4 py-3 border-b border-line/50">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[9px] tracking-wider uppercase font-semibold px-1.5 py-0.5 rounded font-mono"
                style={{ color: m.c, background: m.bg }}
              >
                {m.icon} {m.l}
              </span>
              {it.page != null && <span className="text-[10px] text-muted font-mono">page {it.page}</span>}
              {it.confidence != null && <ConfChip conf={confTier(it.confidence)} />}
              {it.field_hint && (
                <span className="text-[10px] text-status-blue font-mono">↦ matches: {it.field_hint}</span>
              )}
            </div>
            {it.text && <div className="text-[11px] text-muted mb-1">{it.text}</div>}
            {it.value && (
              <div className="text-[12px] p-2 rounded bg-slate2 border border-line/50 font-mono">{String(it.value)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function confTier(c) {
  if (typeof c === 'string') return c.toUpperCase();
  const n = Number(c);
  if (n >= 0.95) return 'HIGH';
  if (n >= 0.75) return 'MED';
  return 'LOW';
}
