import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'lc-v2.devMode';

const DevModeContext = createContext({ enabled: false, toggle: () => {} });

export function DevModeProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch {}
  }, [enabled]);

  const toggle = () => setEnabled(v => !v);

  return (
    <DevModeContext.Provider value={{ enabled, toggle, setEnabled }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  return useContext(DevModeContext);
}
