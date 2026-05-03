import React, { useState } from 'react';
import { Modal } from '../../shared/Modal';

const KIND_OPTIONS = [
  ['model', 'Model got it wrong',     'The page is clear; extractor mis-read. Sends to model-quality queue.'],
  ['doc',   'Document is unclear',    'Source page is ambiguous, smudged, or handwritten. Logged for ops.'],
  ['other', 'Other / cosmetic',       'Format adjustment, normalisation, or note for the audit trail only.'],
];

/**
 * Officer correction modal — distinguishes doc-issue vs model-issue and persists
 * the corrected value via POST /sessions/{id}/documents/{docId}/fields/{key}/correction.
 */
export function CorrectionModal({ open, onClose, label, currentValue, slotValues, onSave }) {
  const [issueKind, setIssueKind] = useState('model');
  const [value, setValue] = useState(currentValue ?? '');
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (open) {
      setValue(currentValue ?? '');
      setIssueKind('model');
      setNote('');
    }
  }, [open, currentValue]);

  const slots = Object.keys(slotValues ?? {});

  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="px-5 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">CORRECT FIELD</div>
          <div className="text-[14px] font-semibold tracking-tight">{label}</div>
        </div>
        <button onClick={onClose} className="text-[#a1a1a6] hover:text-navy-1 text-[18px]">✕</button>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">
            WHY ARE YOU CORRECTING THIS?
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {KIND_OPTIONS.map(([id, l, sub]) => (
              <label
                key={id}
                className={`flex items-start gap-2 p-2.5 rounded-[6px] border cursor-pointer
                  ${issueKind === id ? 'border-navy-1 bg-slate2' : 'border-line hover:bg-slate2'}`}
              >
                <input type="radio" checked={issueKind === id} onChange={() => setIssueKind(id)} className="mt-0.5" />
                <div>
                  <div className="text-[12px] font-medium">{l}</div>
                  <div className="text-[10px] text-muted mt-0.5">{sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {slots.length > 1 && (
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">WHAT EACH EXTRACTOR SAW</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
              {slots.map(s => {
                const v = String(extractValue(slotValues[s]) ?? '—');
                return (
                  <div key={s} className="border border-line rounded p-2 bg-slate2">
                    <div className="text-[9px] tracking-wider uppercase text-muted font-mono">{s}</div>
                    <div className="text-[11px] mt-0.5 break-words font-mono">{v}</div>
                    <button
                      onClick={() => setValue(v)}
                      className="mt-1 text-[9px] text-status-blue hover:underline"
                    >
                      use this →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">CORRECTED VALUE</div>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full border border-line rounded p-2 text-[12px] font-mono"
          />
        </div>
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">NOTE (OPTIONAL)</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Context for the audit trail…"
            className="w-full border border-line rounded p-2 text-[11px] min-h-[60px]"
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-line flex items-center gap-2 bg-slate2">
        <span className="text-[10px] text-muted font-mono">
          {issueKind === 'model' && '⚑ flag → model-quality queue'}
          {issueKind === 'doc' && 'logged · ops review'}
          {issueKind === 'other' && 'audit trail only'}
        </span>
        <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-[6px] border border-line text-[12px] hover:bg-white">
          Cancel
        </button>
        <button
          onClick={() => onSave({ value, issueKind, note })}
          className="px-3 py-1.5 rounded-[6px] bg-navy-1 text-white text-[12px] hover:bg-navy-2"
        >
          Save correction
        </button>
      </div>
    </Modal>
  );
}

function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}
