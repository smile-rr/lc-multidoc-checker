import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * Compact UCP/ISBP citation chip with on-hover (or click) popover that shows
 * the full article excerpt — heading + golden-source text. Replaces the
 * wall-of-citation that used to live at the bottom of the rule drawer.
 *
 * The popover is portalled to <body> so it escapes any stacking context the
 * chip happens to live in (drawers, modals, sticky toolbars). Position is
 * computed from the chip's bounding rect on each open and on scroll/resize.
 */
export function CitationChip({ kind, cite }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef(null);
  const [coords, setCoords] = useState(null); // {top, left, align: 'left'|'right'}

  const isUcp = kind === 'UCP';
  const baseCls = isUcp
    ? 'border-status-blue/40 text-status-blue bg-status-blueSoft'
    : 'border-teal-2/40 text-teal-2 bg-teal-1/10';

  const label = isUcp
    ? `UCP ${formatArticle(cite)}`
    : `ISBP ${cite.article || stripPrefix(cite.id, 'ISBP-')}`;

  const POP_W = 340;
  const place = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const align = right < POP_W ? 'right' : 'left';
    setCoords({
      top: r.bottom + 4,
      left: align === 'left' ? r.left : Math.max(8, r.right - POP_W),
      align,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Click-outside to close pinned popover
  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target) &&
          !(e.target.closest && e.target.closest('[data-citation-popover]'))) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pinned]);

  const popover = open && coords && ReactDOM.createPortal(
    <div
      data-citation-popover
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: POP_W,
        zIndex: 2000,
      }}
      className="bg-white border border-line shadow-2xl rounded-md p-3 text-[11px]"
      onClick={e => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
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
      <div className="text-navy-1/90 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-auto">
        {cite.text || 'No excerpt available.'}
      </div>
    </div>,
    document.body
  );

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
      {popover}
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
