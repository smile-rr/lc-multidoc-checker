import { createContext, useContext, useState } from 'react';

const SessionStatusContext = createContext({
  runningInfo: null,
  setRunningInfo: () => {},
});

export function SessionStatusProvider({ children }) {
  const [runningInfo, setRunningInfo] = useState(null);
  return (
    <SessionStatusContext.Provider value={{ runningInfo, setRunningInfo }}>
      {children}
    </SessionStatusContext.Provider>
  );
}

export function useSessionStatus() {
  return useContext(SessionStatusContext);
}
