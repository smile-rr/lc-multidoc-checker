import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal confirm dialog. Esc + backdrop click both cancel; confirm button
 * autofocuses for keyboard-first officers. Rendered via portal so page
 * stacking contexts can't clip it.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === 'danger'
      ? 'bg-status-red text-white hover:opacity-90'
      : 'bg-navy-1 text-white hover:bg-navy-2';

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-navy-1/60 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-paper rounded-[10px] border border-line shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-navy-1">
          {title}
        </h2>
        <p className="text-sm text-navy-1 leading-relaxed whitespace-pre-line mt-2">
          {message}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm text-muted hover:text-navy-1 px-3 py-2"
          >
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`text-sm font-medium px-4 py-2 rounded ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
