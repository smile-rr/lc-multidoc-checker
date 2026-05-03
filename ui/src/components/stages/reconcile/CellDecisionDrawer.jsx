import React, { useState, useEffect } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { EyebrowLabel } from '../../ui/EyebrowLabel';
import { PrimaryButton, SecondaryButton, GhostButton } from '../../ui/Button';

/**
 * Per-cell decision drawer. Slides in from the right.
 *
 * Four officer actions:
 *   1. Edit value          — opens correction modal (uses parse correction API)
 *   2. Parse error         — flags extraction; surfaces in Parse on rerun
 *   3. Genuine discrepancy — propagates to Examine as a finding
 *   4. Accept as match     — officer override; note REQUIRED (audit)
 *
 * Keyboard: 1/2/3/e to pick action; Esc to close.
 */
export function CellDecisionDrawer({ row, docType, cell, currentDecision, onClose, onDecide, onClear, onEdit }) {
  const [decision, setDecision] = useState(currentDecision?.decision || null);
  const [note, setNote] = useState(currentDecision?.note || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDecision(currentDecision?.decision || null);
    setNote(currentDecision?.note || '');
  }, [currentDecision]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === '1') setDecision('parse_error');
      if (e.key === '2') setDecision('genuine');
      if (e.key === '3') setDecision('accept_match');
      if (e.key === 'e' || e.key === 'E') onEdit?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onEdit]);

  if (!row || !docType) return null;
  const meta = docTypeMeta(docType);
  const lcVal = row.cells?.LC?.value ?? row.valueByDocType?.LC ?? null;
  const noteRequired = decision === 'accept_match';
  const canSave = decision != null && (!noteRequired || note.trim().length > 0);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onDecide?.({ decision, note: note.trim() || null });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await onClear?.();
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-navy-1/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-[480px] bg-white border-l border-line shadow-xl flex flex-col">
        <div className="px-5 py-3 border-b border-line bg-slate2 flex items-center justify-between">
          <div>
            <EyebrowLabel>cell decision</EyebrowLabel>
            <div className="text-[14px] font-semibold tracking-tight">
              {row.label || row.fieldKey}
              <span className="text-muted font-normal"> · </span>
              <span style={{ color: meta.color }}>{meta.short}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-navy-1 text-[12px]">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* Values pane */}
          <div className="space-y-2">
            <EyebrowLabel>values</EyebrowLabel>
            <div className="bg-slate2 border-l-2 border-navy-1 px-3 py-2">
              <div className="text-[10px] tracking-wider text-navy-1/70 font-mono mb-0.5">LC ▸ REF</div>
              <div className="text-[13px] font-mono break-words">
                {lcVal != null && lcVal !== '' ? lcVal : <span className="text-muted">—</span>}
              </div>
            </div>
            <div className={`px-3 py-2 border-l-2 ${
              cell?.verdict === 'DISCREPANCY' ? 'bg-status-redSoft border-l-status-red'
              : cell?.verdict === 'TOLERANCE' ? 'bg-status-goldSoft border-l-status-gold'
              : 'bg-slate2 border-l-line'
            }`}>
              <div className="text-[10px] tracking-wider font-mono mb-0.5" style={{ color: meta.color }}>
                {meta.short} ▸ {meta.name}
              </div>
              <div className="text-[13px] font-mono break-words">
                {cell?.value != null && cell?.value !== '' ? cell.value : <span className="text-muted">—</span>}
              </div>
              {cell?.detail && (
                <div className="text-[10px] text-muted mt-1 font-mono">{cell.detail}</div>
              )}
            </div>
          </div>

          {/* Action picker */}
          <div className="space-y-2">
            <EyebrowLabel>officer decision</EyebrowLabel>
            <div className="space-y-1.5">
              <ActionRadio
                id="parse_error" hotkey="1" current={decision} onSelect={setDecision}
                label="Parse error"
                desc="Extraction was wrong. Use Edit to correct, then mark."
              />
              <ActionRadio
                id="genuine" hotkey="2" current={decision} onSelect={setDecision}
                label="Genuine discrepancy"
                desc="Real conflict — surfaces in Examine as a finding."
              />
              <ActionRadio
                id="accept_match" hotkey="3" current={decision} onSelect={setDecision}
                label="Accept as match"
                desc="Officer override (e.g. cosmetic). Note required for audit."
              />
            </div>

            {decision === 'accept_match' && (
              <div className="mt-2">
                <label className="text-[10px] tracking-wider uppercase text-muted font-mono block mb-1">
                  Audit note (required)
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. PCS = pieces = units, normalisation only"
                  className="w-full text-[12px] font-mono border border-line rounded px-2 py-1.5 focus:outline-none focus:border-teal-1"
                />
              </div>
            )}
          </div>

          {/* Edit value */}
          <div className="space-y-2">
            <EyebrowLabel>or correct the value directly</EyebrowLabel>
            <SecondaryButton onClick={onEdit} className="w-full justify-center">
              ✎ Edit extracted value (E)
            </SecondaryButton>
            <p className="text-[10px] text-muted font-mono">
              Editing recalculates verdicts and dirties Examine — next Continue re-runs from Examine.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-line bg-slate2 flex items-center gap-2">
          {currentDecision && (
            <GhostButton onClick={clear} disabled={saving}>
              ↻ clear decision
            </GhostButton>
          )}
          <SecondaryButton onClick={onClose} disabled={saving} className="ml-auto">Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canSave || saving}>
            {saving ? '…' : 'Save decision'}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}

function ActionRadio({ id, hotkey, current, onSelect, label, desc }) {
  const active = current === id;
  return (
    <button
      onClick={() => onSelect(id)}
      className={`w-full text-left border rounded-[6px] px-3 py-2 transition-colors flex items-start gap-3
        ${active ? 'border-navy-1 bg-slate2' : 'border-line hover:border-[#a1a1a6] bg-white'}`}
    >
      <span className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0
        ${active ? 'border-navy-1 bg-navy-1' : 'border-line'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium flex items-center gap-2">
          {label}
          <span className="text-[10px] text-muted font-mono">[{hotkey}]</span>
        </div>
        <div className="text-[11px] text-muted">{desc}</div>
      </div>
    </button>
  );
}
