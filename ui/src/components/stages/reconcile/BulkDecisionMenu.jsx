import React, { useState } from 'react';
import { EyebrowLabel } from '../../ui/EyebrowLabel';
import { PrimaryButton, SecondaryButton } from '../../ui/Button';

/**
 * Modal popover for applying one decision to many cells at once.
 *   scope: { kind: 'row' | 'column', target: row|docType, count }
 *   onApply({decision, note, cells: [...]}) — caller resolves which cells to act on
 */
export function BulkDecisionMenu({ scope, onClose, onApply }) {
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!scope) return null;
  const noteRequired = decision === 'accept_match';
  const canApply = decision != null && (!noteRequired || note.trim().length > 0);

  const apply = async () => {
    if (!canApply) return;
    setSaving(true);
    try {
      await onApply?.({ decision, note: note.trim() || null });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const headline = scope.kind === 'row'
    ? `Bulk decision · row "${scope.label}"`
    : `Bulk decision · column "${scope.label}"`;
  const sub = `${scope.count} attention cell${scope.count === 1 ? '' : 's'} (DISCREPANCY/TOLERANCE/MISSING)`;

  return (
    <>
      <div className="fixed inset-0 bg-navy-1/30 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[460px] bg-white border border-line rounded-[10px] shadow-xl">
        <div className="px-5 py-3 border-b border-line bg-slate2">
          <EyebrowLabel>{scope.kind === 'row' ? 'row bulk' : 'column bulk'}</EyebrowLabel>
          <div className="text-[14px] font-semibold tracking-tight">{headline}</div>
          <div className="text-[11px] text-muted font-mono mt-0.5">{sub}</div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[11px] text-muted">
            Apply the same officer decision to every attention cell in this {scope.kind}.
            Existing decisions will be overwritten.
          </p>
          <div className="space-y-1.5">
            {[
              ['parse_error', 'Parse error', 'All extractions in this scope flagged as wrong'],
              ['genuine', 'Genuine discrepancy', 'All surface as findings in Examine'],
              ['accept_match', 'Accept as match', 'All overridden — note required for audit'],
            ].map(([id, label, desc]) => (
              <button
                key={id}
                onClick={() => setDecision(id)}
                className={`w-full text-left border rounded-[6px] px-3 py-2 transition-colors flex items-start gap-3
                  ${decision === id ? 'border-navy-1 bg-slate2' : 'border-line hover:border-[#a1a1a6] bg-white'}`}
              >
                <span className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0
                  ${decision === id ? 'border-navy-1 bg-navy-1' : 'border-line'}`} />
                <div>
                  <div className="text-[12px] font-medium">{label}</div>
                  <div className="text-[11px] text-muted">{desc}</div>
                </div>
              </button>
            ))}
          </div>
          {decision === 'accept_match' && (
            <div>
              <label className="text-[10px] tracking-wider uppercase text-muted font-mono block mb-1">
                Audit note (required for all cells)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                className="w-full text-[12px] font-mono border border-line rounded px-2 py-1.5 focus:outline-none focus:border-teal-1"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line bg-slate2 flex items-center gap-2 justify-end">
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={apply} disabled={!canApply || saving}>
            {saving ? '…' : `Apply to ${scope.count} cell${scope.count === 1 ? '' : 's'}`}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
