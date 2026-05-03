import React, { useState } from 'react';

const REASONS = [
  'Wrong judgement',
  'Out of scope',
  'Better evidence',
  'Cured by amendment',
  'Other',
];

export function OverrideForm({ ruleId, currentVerdict, initialFlagged, onSubmit, onCancel }) {
  const [newStatus, setNewStatus] = useState(currentVerdict === 'PASS' ? 'FAIL' : 'PASS');
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [flagged, setFlagged] = useState(!!initialFlagged);

  const canSubmit = note.trim().length > 0;

  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">OFFICER ACTION</div>
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <span>Set status to:</span>
        <select
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
          className="border border-line rounded px-2 py-1 text-[11px] bg-white"
        >
          <option>PASS</option>
          <option>FAIL</option>
          <option>DOUBTS</option>
          <option>NOT_APPLICABLE</option>
        </select>
        <span className="ml-2">Reason:</span>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="border border-line rounded px-2 py-1 text-[11px] bg-white"
        >
          {REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <label className="ml-2 flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={flagged} onChange={e => setFlagged(e.target.checked)} />
          Flag agent error
        </label>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note for audit trail (required)…"
        className="w-full border border-line rounded p-2 text-[11px] min-h-[60px]"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => onSubmit({ newStatus, reason, note: note.trim(), flagged })}
          disabled={!canSubmit}
          className={`px-3 py-1.5 rounded text-[11px]
            ${canSubmit ? 'bg-navy-1 text-white hover:bg-navy-2' : 'bg-line text-muted cursor-not-allowed'}`}
        >
          Apply override
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded text-[11px] border border-line hover:bg-slate2">
          Cancel
        </button>
      </div>
    </div>
  );
}
