import React, { useState } from 'react';
import { Modal } from '../../shared/Modal';

export function UnlockModal({ open, onClose, onUnlock }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={() => { setReason(''); onClose(); }} width={480}>
      <div className="p-5">
        <div className="text-[14px] font-semibold mb-1">Unlock parsed dataset</div>
        <div className="text-[11px] text-muted mb-3">
          Unlocking re-opens parsed values for editing. The action, your officer ID, and the reason
          below are appended to the audit trail.
        </div>
        <label className="text-[10px] tracking-wider uppercase text-muted font-mono">
          Reason for unlock
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Discovered post-lock that BL container number was mis-parsed; correcting before forwarding."
          className="mt-1 w-full px-3 py-2 border border-line rounded-[6px] text-[11px] font-mono"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => { setReason(''); onClose(); }}
            className="px-3 py-1.5 rounded-[6px] border border-line text-[11px] hover:bg-slate2"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={async () => { await onUnlock(reason.trim()); setReason(''); }}
            className="px-3 py-1.5 rounded-[6px] text-[11px] bg-status-gold text-white hover:bg-status-gold/80 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Unlock with reason
          </button>
        </div>
      </div>
    </Modal>
  );
}
