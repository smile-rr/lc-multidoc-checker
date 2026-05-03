import React from 'react';

export function EvidencePanel({ evidence }) {
  if (!evidence || (evidence.lc == null && evidence.doc == null && evidence.details == null)) {
    return <div className="text-[11px] text-[#a1a1a6]">No structured evidence captured for this rule.</div>;
  }
  if (evidence.details && evidence.lc == null && evidence.doc == null) {
    return (
      <pre className="text-[11px] bg-slate2 p-3 rounded font-mono overflow-auto">
        {JSON.stringify(evidence.details, null, 2)}
      </pre>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
      <div className="border border-line rounded p-3 bg-slate2">
        <div className="text-[9px] tracking-wider uppercase text-teal-1 mb-1">LC</div>
        <div>{String(evidence.lc ?? '—')}</div>
      </div>
      <div className="border border-line rounded p-3 bg-slate2">
        <div className="text-[9px] tracking-wider uppercase text-status-blue mb-1">DOCUMENT</div>
        <div>{String(evidence.doc ?? '—')}</div>
      </div>
    </div>
  );
}
