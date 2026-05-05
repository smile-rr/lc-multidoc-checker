import React from 'react';

// Detects "<DOCTYPE>:" prefixes in rule explanations and renders one block
// per document with a small label. Falls back to plain text when no doc
// markers are present.
const DOC_TYPES = ['LC', 'INV', 'BOL', 'PKL', 'BOE', 'BC', 'WC', 'INS'];
const SPLIT_RE = new RegExp(`(?:^|[\\s;.])(${DOC_TYPES.join('|')})\\s*:\\s*`, 'g');

const TONE = {
  LC:  'bg-slate-50 text-slate-700 border-slate-300',
  INV: 'bg-status-blueSoft text-status-blue border-status-blue/30',
  BOL: 'bg-purple-50 text-purple-700 border-purple-200',
  PKL: 'bg-amber-50 text-amber-800 border-amber-300',
  BOE: 'bg-status-greenSoft text-status-green border-status-green/30',
  BC:  'bg-teal-1/10 text-teal-1 border-teal-1/30',
  WC:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  INS: 'bg-status-redSoft text-status-red border-status-red/30',
};

export function MultiDocExplanation({ text, className = '' }) {
  if (!text) return null;
  const segments = parseSegments(text);

  if (segments.length === 0 || (segments.length === 1 && !segments[0].doc)) {
    return <p className={`text-xs leading-relaxed whitespace-pre-line ${className}`}>{text}</p>;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {segments.map((seg, i) => (
        <div key={i} className="flex items-start gap-2">
          {seg.doc ? (
            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${TONE[seg.doc] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {seg.doc}
            </span>
          ) : (
            <span className="w-[34px] shrink-0" />
          )}
          <p className="text-xs leading-relaxed flex-1">{seg.text}</p>
        </div>
      ))}
    </div>
  );
}

function parseSegments(raw) {
  const text = raw.trim();
  // Find all "DOC:" markers, keep their indices.
  const markers = [];
  let m;
  const re = new RegExp(SPLIT_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    // m.index points at the leading whitespace/punct char (or start of string)
    const docStart = text.startsWith(m[1], m.index) ? m.index : m.index + 1;
    markers.push({ start: docStart, doc: m[1], headerEnd: re.lastIndex });
  }

  if (markers.length === 0) {
    return [{ doc: null, text }];
  }

  const segments = [];
  if (markers[0].start > 0) {
    const lead = text.slice(0, markers[0].start).trim();
    if (lead) segments.push({ doc: null, text: lead });
  }
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].headerEnd;
    const end = i + 1 < markers.length ? markers[i + 1].start : text.length;
    const body = text.slice(start, end).trim().replace(/^[;.,]\s*/, '');
    if (body) segments.push({ doc: markers[i].doc, text: body });
  }
  return segments;
}
