import React from 'react';

/** Side-by-side table of all slot values per field (when "Compare extractors" is on). */
export function CompareModeTable({ fields, slotResults }) {
  const slots = Object.keys(slotResults || {});
  const fieldKeys = Object.keys(fields || {});
  if (slots.length === 0) {
    return <div className="p-4 text-[11px] text-muted italic">No per-slot results recorded — only consensus is available.</div>;
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="bg-slate2 border-b border-line sticky top-0">
        <tr>
          <th className="text-left p-2 font-normal text-[9px] tracking-wider uppercase text-muted">Field</th>
          {slots.map(s => (
            <th key={s} className="text-left p-2 font-normal text-[9px] tracking-wider uppercase text-muted">{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fieldKeys.map(k => {
          const consensus = String(extractValue(fields[k]) ?? '');
          return (
            <tr key={k} className="border-b border-line/50">
              <td className="p-2 text-muted" style={{ fontFamily: 'system-ui' }}>{k}</td>
              {slots.map(s => {
                const slotVal = String(extractValue(slotResults[s]?.[k]) ?? '');
                const matches = slotVal === consensus;
                return (
                  <td
                    key={s}
                    className={`p-2 ${matches ? 'text-teal-1' : 'text-navy-1'}`}
                    title={matches ? 'matches consensus' : 'differs from consensus'}
                  >
                    {slotVal || '—'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Field values from extraction_results may be wrapped as {value, confidence, ...}
// or plain scalars. Normalise to the inner value.
function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}
