import React, { useState, useRef, useEffect } from 'react';

/**
 * Compact UCP/ISBP citation chip with on-hover (or click) popover that shows
 * the full article excerpt — heading + golden-source text. Replaces the
 * wall-of-citation that used to live at the bottom of the rule drawer.
 *
 * Use anywhere a UCP or ISBP reference needs to surface in-place without
 * stealing the main content area.
 */
export function CitationChip({ kind, cite }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef(null);
  const [pos, setPos] = useState('right'); // 'right' | 'left'

  const isUcp = kind === 'UCP';
  const baseCls = isUcp
    ? 'border-status-blue/40 text-status-blue bg-status-blueSoft'
    : 'border-teal-2/40 text-teal-2 bg-teal-1/10';

  const label = isUcp
    ? `UCP ${formatArticle(cite)}`
    : `ISBP ${cite.article || stripPrefix(cite.id, 'ISBP-')}`;

  // Auto-flip popover to the left side if it would clip the viewport on the right.
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setPos(window.innerWidth - r.right < 360 ? 'left' : 'right');
  }, [open]);

  // Click-outside to close pinned popover
  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pinned]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-block"
      onMouseEnter={() => !pinned && setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setPinned(p => !p); setOpen(true); }}
        className={`inline-flex items-center text-[9.5px] font-mono px-1.5 py-0.5 rounded border ${baseCls} hover:brightness-95 transition`}
        title="Click to pin"
      >
        {label}
      </button>
      {open && (
        <div
          className={`absolute z-50 top-full mt-1 w-[340px] bg-white border border-line shadow-xl rounded-md p-3 text-[11px] ${pos === 'left' ? 'right-0' : 'left-0'}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] tracking-[0.16em] uppercase font-mono ${isUcp ? 'text-status-blue' : 'text-teal-2'}`}>
              {isUcp ? 'UCP 600' : 'ISBP 821'}
            </span>
            <span className="text-[9px] font-mono text-muted">{cite.id}</span>
            {pinned && (
              <span className="ml-auto text-[8px] uppercase tracking-wider font-mono text-muted">📌 pinned</span>
            )}
          </div>
          {cite.heading && (
            <div className="font-semibold text-navy-1 mb-1.5 leading-snug">{cite.heading}</div>
          )}
          <div className="text-navy-1/90 leading-relaxed whitespace-pre-wrap">
            {cite.text || 'No excerpt available.'}
          </div>
        </div>
      )}
    </span>
  );
}

function formatArticle(cite) {
  if (!cite) return '';
  const article = cite.article || stripPrefix(cite.id, 'UCP-').split('-')[0];
  const para = (cite.paragraph || '').replace(/\(/g, '-').replace(/\)/g, '');
  return para ? `${article}${para}` : article;
}

function stripPrefix(s, p) { return s && s.startsWith(p) ? s.slice(p.length) : s; }
