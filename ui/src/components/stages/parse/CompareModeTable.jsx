import React from 'react';
import { Diff } from './Diff';

/** Side-by-side per-slot table with own-mode highlight (winner=green, other=red). */
export function CompareModeTable({ fields, slotResults, fieldMeta }) {
  const slots = Object.keys(slotResults || {});
  const fieldKeys = Object.keys(fields || {});
  if (slots.length === 0) {
    return <div className="p-4 text-[11px] text-muted italic">No per-slot results recorded — only consensus is available.</div>;
  }
  return (
    <table className="w-full text-[11px]">
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
          const fieldType = fieldMeta?.[k]?.type;
          const allMatch = slots.every(s =>
            String(extractValue(slotResults[s]?.[k]) ?? '') === consensus,
          );
          return (
            <tr key={k} className={`border-b border-line/50 ${allMatch ? '' : 'bg-status-goldSoft/30'}`}>
              <td className="p-2 text-muted text-[10px] align-top" style={{ fontFamily: 'system-ui' }}>{k}</td>
              {slots.map((s, i) => {
                const slotVal = String(extractValue(slotResults[s]?.[k]) ?? '');
                const isWinner = slotVal === consensus;
                const baseline = slots.length === 2
                  ? String(extractValue(slotResults[slots[1 - i]]?.[k]) ?? '')
                  : consensus;
                return (
                  <td key={s} className="p-2 align-top text-[11px]">
                    <Diff
                      baseline={baseline}
                      value={slotVal}
                      fieldType={fieldType}
                      mode="own"
                      tone={isWinner ? 'green' : 'red'}
                    />
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

function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}
