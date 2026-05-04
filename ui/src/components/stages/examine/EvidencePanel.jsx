import React from 'react';

/**
 * Compact evidence rows — LC source vs document source — rendered as a
 * key-value table rather than two side-by-side cards. The drawer owns the
 * narrative; this panel just shows the raw values being compared.
 *
 * Falls back to a JSON dump for free-form `details` payloads (e.g. AGENTIC
 * rules whose evidence shape doesn't fit the LC/doc dichotomy).
 */
export function EvidencePanel({ evidence }) {
  if (!evidence) return null;

  const rows = [];
  if (evidence.lc != null) {
    rows.push({ label: 'LC', value: stringify(evidence.lc), tone: 'lc' });
  }
  if (evidence.doc != null) {
    rows.push({ label: 'Document', value: stringify(evidence.doc), tone: 'doc' });
  }

  // Per-doc breakdown when evidence.docs is a map of {docType → value}
  if (evidence.docs && typeof evidence.docs === 'object') {
    for (const [k, v] of Object.entries(evidence.docs)) {
      rows.push({ label: k, value: stringify(v), tone: 'doc', mono: true });
    }
  }

  if (rows.length === 0 && evidence.details) {
    return (
      <pre className="text-[10.5px] bg-slate2 p-2.5 rounded font-mono overflow-auto border border-line/60 max-h-48">
        {JSON.stringify(evidence.details, null, 2)}
      </pre>
    );
  }

  if (rows.length === 0) {
    return <div className="text-[11px] text-muted italic">No structured evidence captured.</div>;
  }

  return (
    <div className="border border-line/60 rounded overflow-hidden">
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className={`flex items-baseline gap-3 px-2.5 py-1.5 text-[11px] ${i > 0 ? 'border-t border-line/40' : ''} ${i % 2 ? 'bg-slate2/40' : ''}`}
        >
          <span
            className={`text-[9px] font-mono tracking-wider uppercase shrink-0 w-[78px] ${r.tone === 'lc' ? 'text-teal-2' : 'text-status-blue'}`}
          >
            {r.label}
          </span>
          <span className="font-mono text-navy-1 break-words min-w-0 flex-1">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function stringify(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
