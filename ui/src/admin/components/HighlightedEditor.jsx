import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

// Patterns recognized by the viewer. Order matters — first match wins per index.
// All patterns are scanned globally; we then merge non-overlapping matches.
const PATTERNS = [
  // 1. Explicit template tokens — {{rule.x}}, {{ref.UCP-14-c}}, {{lc.x}}, {{doc.INV.x}}, {{system.x}}
  { kind: 'token',  re: /\{\{\s*([a-zA-Z_][\w]*)(?:\.([\w\-]+))?(?:\.([\w\-]+))?\s*\}\}/g,
    classify: (m) => `tok-${m[1]}` },
  // 2. SWIFT MT700 tags — :32B:, :39A:, :45A: …
  { kind: 'swift',  re: /:\d{2}[A-Z]?:/g, classify: () => 'swift' },
  // 3. UCP 600 article citations — "UCP 14(c)", "Art. 14(c)", "UCP 600 Art. 14(i)", "UCP-14-c"
  { kind: 'ucp',    re: /\b(?:UCP\s?600\s+)?(?:Art\.?\s+)?(?:UCP\s+)?(\d{1,3})\s?\(\s?([a-z]{1,3})\s?\)|\bUCP-\d{1,3}-[a-z]{1,3}\b|\bArt\.?\s+\d{1,3}\b/gi,
    classify: () => 'ucp' },
  // 4. ISBP 821 paragraph citations — "ISBP A15", "ISBP-A15", "ISBP 821 A15"
  { kind: 'isbp',   re: /\bISBP(?:\s+821)?\s?[-\s]?[A-Z]\d{1,3}\b/g, classify: () => 'isbp' },
];

const TOKEN_KIND_CLASS = {
  rule:   'bg-amber-100 text-amber-800 border-amber-300',
  ref:    'bg-blue-100 text-blue-800 border-blue-300',
  lc:     'bg-teal-1/15 text-teal-1 border-teal-1/40',
  doc:    'bg-purple-100 text-purple-800 border-purple-300',
  system: 'bg-slate-100 text-slate-700 border-slate-300',
};

const PROSE_KIND_CLASS = {
  swift: 'bg-orange-50 text-orange-700 border-orange-200',
  ucp:   'bg-blue-50 text-blue-800 border-blue-200',
  isbp:  'bg-purple-50 text-purple-700 border-purple-200',
};

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const collectMatches = (text) => {
  const matches = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, kind: p.kind, raw: m, label: p.classify(m) });
    }
  }
  // Sort by start; resolve overlaps by preferring earlier+longer
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const merged = [];
  let cursor = -1;
  for (const m of matches) {
    if (m.start >= cursor) {
      merged.push(m);
      cursor = m.end;
    }
  }
  return merged;
};

const tokenize = (text, flashRange) => {
  const matches = collectMatches(text);
  let html = '';
  let last = 0;
  for (const m of matches) {
    html += escapeHtml(text.slice(last, m.start));
    const segment = text.slice(m.start, m.end);
    let cls;
    if (m.kind === 'token') {
      const tokenKind = m.label.replace('tok-', '');
      cls = TOKEN_KIND_CLASS[tokenKind] || 'bg-slate-50 text-slate-600 border-slate-200';
    } else {
      cls = PROSE_KIND_CLASS[m.kind];
    }
    const isFlash = flashRange && m.start >= flashRange.start && m.end <= flashRange.end;
    const flashCls = isFlash ? ' ring-2 ring-teal-1 ring-offset-1 animate-pulse' : '';
    html += `<span class="inline-block px-1 rounded border ${cls}${flashCls}" style="font-family:inherit;font-size:inherit;line-height:inherit">${escapeHtml(segment)}</span>`;
    last = m.end;
  }
  html += escapeHtml(text.slice(last));
  if (text.endsWith('\n')) html += '\n';
  return html;
};

export const HighlightedEditor = forwardRef(function HighlightedEditor(
  { value, onChange, disabled, rows = 28 },
  ref
) {
  const taRef = useRef(null);
  const preRef = useRef(null);
  const [flashRange, setFlashRange] = useState(null);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      const newEnd = start + text.length;
      setFlashRange({ start, end: newEnd });
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newEnd, newEnd);
        // Try to scroll the inserted token into view via the overlay.
        const pre = preRef.current;
        if (pre) {
          const lineHeight = parseFloat(getComputedStyle(pre).lineHeight) || 18;
          const linesBefore = next.slice(0, newEnd).split('\n').length - 1;
          ta.scrollTop = Math.max(0, linesBefore * lineHeight - ta.clientHeight / 2);
        }
      });
      // Clear flash after 1.5s
      setTimeout(() => setFlashRange(null), 1500);
    },
    focus: () => taRef.current?.focus(),
  }));

  // Sync scroll between textarea and pre
  useEffect(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    const sync = () => {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  const html = tokenize(value, flashRange);

  return (
    <div className="relative" style={{ minHeight: `${rows * 1.5}em` }}>
      <pre
        ref={preRef}
        aria-hidden="true"
        className="absolute inset-0 m-0 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words overflow-auto pointer-events-none text-navy-1"
        style={{ fontFamily: 'ui-monospace, "JetBrains Mono", monospace' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html + '<br/>' }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        rows={rows}
        className="relative w-full p-3 font-mono text-[11px] leading-relaxed bg-transparent caret-teal-1 outline-none resize-y whitespace-pre-wrap break-words"
        style={{ fontFamily: 'ui-monospace, "JetBrains Mono", monospace', color: 'transparent' }}
      />
    </div>
  );
});

// Read-only viewer — same highlighting, no textarea.
export function HighlightedViewer({ value, rows = 28, className = '' }) {
  const html = tokenize(value, null);
  return (
    <pre
      className={`m-0 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words overflow-auto text-navy-1 ${className}`}
      style={{ fontFamily: 'ui-monospace, "JetBrains Mono", monospace', minHeight: `${rows * 1.5}em`, maxHeight: '70vh' }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Exported for the legend in the editor toolbar
export const PROSE_LEGEND = [
  { kind: 'swift', label: ':45A: SWIFT tag', cls: PROSE_KIND_CLASS.swift },
  { kind: 'ucp',   label: 'UCP 14(c)',       cls: PROSE_KIND_CLASS.ucp },
  { kind: 'isbp',  label: 'ISBP A15',        cls: PROSE_KIND_CLASS.isbp },
];
