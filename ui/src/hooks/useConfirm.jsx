import React, { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/shell/ConfirmDialog';

/**
 * Promise-based imperative confirm. Render `Dialog` once anywhere in the tree;
 * call `confirm({ title, message, ... })` to get a Promise that resolves true
 * on confirm, false on cancel/Esc/backdrop.
 */
export function useConfirm() {
  const [pending, setPending] = useState(null);

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const Dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      onConfirm={() => { pending.resolve(true); setPending(null); }}
      onCancel={() => { pending.resolve(false); setPending(null); }}
    />
  ) : null;

  return { confirm, Dialog };
}
