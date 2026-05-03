import React from 'react';

export function OfficerNote({ value, onChange }) {
  return (
    <div className="bg-white border border-line rounded-[10px] p-4">
      <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">
        OFFICER'S NOTE FOR THE RECORD
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Required. Document your reasoning, any communications with applicant, and basis for decision…"
        className="w-full border border-line rounded p-3 text-[12px] min-h-[100px]"
      />
    </div>
  );
}
