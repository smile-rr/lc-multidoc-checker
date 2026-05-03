import React, { useEffect } from 'react';

/**
 * Simple modal shell. Click outside or Escape closes; pass `width` (px) for the
 * dialog width. Wrap modal content in your own padding/sections.
 */
export function Modal({ open, onClose, width = 480, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[10px] shadow-2xl"
        style={{ width, maxWidth: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
