import { useEffect } from 'react';

/**
 * Wires `[`/`]` to docNav and `,`/`.` to pageNav. Skips when an input/textarea
 * has focus so we don't intercept text entry.
 */
export function useKeyboardNav({ onDocPrev, onDocNext, onPagePrev, onPageNext }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === '[') { e.preventDefault(); onDocPrev?.(); }
      else if (e.key === ']') { e.preventDefault(); onDocNext?.(); }
      else if (e.key === ',') { e.preventDefault(); onPagePrev?.(); }
      else if (e.key === '.') { e.preventDefault(); onPageNext?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDocPrev, onDocNext, onPagePrev, onPageNext]);
}
