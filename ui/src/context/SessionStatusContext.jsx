import { createContext, useContext, useState } from 'react';

const SessionStatusContext = createContext({
  runningInfo: null,
  eventCount: 0,
  setRunningInfo: () => {},
  setEventCount: () => {},
});

export function SessionStatusProvider({ children }) {
  const [runningInfo, setRunningInfoRaw] = useState(null);
  const [eventCount, setEventCountRaw] = useState(0);

  function setRunningInfo(info) {
    setRunningInfoRaw(prev => {
      if (!info && !prev) return null;
      if (!info) return null;
      if (prev && prev.id === info.id && prev.status === info.status && prev.eventCount === info.eventCount) {
        return prev;
      }
      return info;
    });
  }

  function setEventCount(count) {
    setEventCountRaw(count);
  }

  return (
    <SessionStatusContext.Provider value={{ runningInfo, eventCount, setRunningInfo, setEventCount }}>
      {children}
    </SessionStatusContext.Provider>
  );
}

export function useSessionStatus() {
  return useContext(SessionStatusContext);
}
