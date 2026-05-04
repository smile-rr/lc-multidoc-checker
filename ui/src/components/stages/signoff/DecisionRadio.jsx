import React from 'react';

const OPTIONS = [
  ['ACCEPT', 'Accept as compliant',         'All findings cleared / waived',                          '#1a7a43'],
  ['WAIVER', 'Pay under reserve / waiver',  'Honour with reservation, applicant approached',          '#0066cc'],
  ['REFUSE', 'Refuse documents',            'Issue MT734 refusal advice within 5 banking days',       '#cc0011'],
];

export function DecisionRadio({ decision, onChange, readOnly }) {
  if (readOnly) {
    // Sealed view: only show the chosen option, dim the others.
    return (
      <div className="space-y-2">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-3 font-mono">DECISION (SEALED)</div>
        {OPTIONS.map(([id, label, sub, color]) => {
          const selected = decision === id;
          return (
            <div
              key={id}
              className={`flex items-start gap-2 p-2.5 rounded-[6px] border
                ${selected ? 'border-navy-1 bg-slate2' : 'border-line opacity-40'}`}
            >
              <span className={`mt-0.5 inline-block w-3 h-3 rounded-full border ${selected ? 'border-navy-1 bg-navy-1' : 'border-line'}`} />
              <div className="flex-1">
                <div className="text-[12px] font-semibold" style={{ color }}>{label}</div>
                <div className="text-[10px] text-muted mt-0.5">{sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-3 font-mono">DECISION</div>
      {OPTIONS.map(([id, label, sub, color]) => (
        <label
          key={id}
          className={`flex items-start gap-2 p-2.5 rounded-[6px] border cursor-pointer
            ${decision === id ? 'border-navy-1 bg-slate2' : 'border-line hover:bg-slate2'}`}
        >
          <input
            type="radio"
            checked={decision === id}
            onChange={() => onChange(id)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="text-[12px] font-semibold" style={{ color }}>{label}</div>
            <div className="text-[10px] text-muted mt-0.5">{sub}</div>
          </div>
        </label>
      ))}
    </div>
  );
}
