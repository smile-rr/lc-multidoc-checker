import React from 'react';

/**
 * Off-schema items — raw verbatim quote plus chips for `kind` (handwritten /
 * stamp / watermark / correction) and `tags[]` (signature_block, stamp_seal,
 * etc.). The vision prompts already populate these; this surface makes them
 * visible to the officer.
 */
const KIND_STYLES = {
  handwritten: 'bg-amber-100 text-amber-800 border-amber-300',
  stamp:       'bg-violet-100 text-violet-800 border-violet-300',
  watermark:   'bg-sky-100 text-sky-800 border-sky-300',
  correction:  'bg-rose-100 text-rose-800 border-rose-300',
};

function Chip({ label, className = '' }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded border ${className}`}>
      {label}
    </span>
  );
}

export function OffSchemaPanel({ items }) {
  if (!items || items.length === 0) {
    return <div className="p-4 text-[11px] text-muted">No off-schema content detected on this document.</div>;
  }
  return (
    <div className="flex-1 overflow-auto">
      {items.map((it, i) => {
        const raw = it.rawQuote ?? it.raw_quote ?? '';
        const kind = it.kind ?? null;
        const tags = Array.isArray(it.tags) ? it.tags : [];
        const label = [it.value, it.location].filter(Boolean).join(' · ');
        const kindClass = kind ? (KIND_STYLES[kind] ?? 'bg-slate-100 text-slate-700 border-slate-300') : '';
        return (
          <div key={i} className="px-4 py-3 border-b border-line/50">
            {(kind || tags.length > 0) && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {kind && <Chip label={kind} className={kindClass} />}
                {tags.map((t) => (
                  <Chip key={t} label={t} className="bg-slate-50 text-slate-600 border-slate-200" />
                ))}
              </div>
            )}
            <div className="font-mono text-[12px] text-navy-1 whitespace-pre-wrap break-words leading-snug">
              {raw || <em className="text-muted">— no raw text —</em>}
            </div>
            {label && (
              <div className="mt-1 text-[10px] text-muted italic tracking-wide">
                {label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
