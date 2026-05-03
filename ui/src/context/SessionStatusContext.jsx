import { createContext, useContext, useState } from 'react';

const SessionStatusContext = createContext({
  runningInfo: null,
  setRunningInfo: () => {},
});

export function SessionStatusProvider({ children }) {
  const [runningInfo, setRunningInfoRaw] = useState(null);

  function setRunningInfo(info) {
    // Avoid unnecessary re-renders of TopNav when eventCount hasn't changed.
    // If new info is same shape with same eventCount, keep the existing object.
    setRunningInfoRaw(prev => {
      if (!info && !prev) return null;
      if (!info) return null;
      if (prev && prev.id === info.id && prev.status === info.status && prev.eventCount === info.eventCount) {
        return prev;
      }
      return info;
    });
  }

  return (
    <SessionStatusContext.Provider value={{ runningInfo, setRunningInfo }}>
      {children}
    </SessionStatusContext.Provider>
  );
}

export function useSessionStatus() {
  return useContext(SessionStatusContext);
}
