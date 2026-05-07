import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Lightweight cross-component handle for the HomePage upload draft.
 *
 * HomePage owns the staged files; TopNav needs to know whether a draft
 * exists (to gate the "New Check" confirm) and how to clear it. Rather
 * than lift the file array itself, HomePage registers a `clear` callback
 * and a boolean flag — TopNav reads the flag, calls the callback on
 * confirmed reset.
 */
const UploadDraftContext = createContext({
  hasDraft: false,
  registerDraft: () => () => {},
  clearDraft: () => {},
});

export function UploadDraftProvider({ children }) {
  const [hasDraft, setHasDraft] = useState(false);
  const clearRef = useRef(() => {});

  const registerDraft = useCallback((has, clearFn) => {
    setHasDraft(has);
    clearRef.current = clearFn || (() => {});
    return () => {
      setHasDraft(false);
      clearRef.current = () => {};
    };
  }, []);

  const clearDraft = useCallback(() => {
    clearRef.current?.();
    setHasDraft(false);
  }, []);

  return (
    <UploadDraftContext.Provider value={{ hasDraft, registerDraft, clearDraft }}>
      {children}
    </UploadDraftContext.Provider>
  );
}

export function useUploadDraft() {
  return useContext(UploadDraftContext);
}
