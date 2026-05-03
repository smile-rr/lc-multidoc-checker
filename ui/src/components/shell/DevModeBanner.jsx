import React from 'react';
import { useDevMode } from '../../context/DevModeContext';

/** Persistent orange banner shown across the app when DEV MODE is enabled. */
export function DevModeBanner() {
  const { enabled, toggle } = useDevMode();
  if (!enabled) return null;
  return (
    <div className="bg-status-goldSoft border-b border-status-gold px-4 py-1.5 flex items-center justify-between text-xs text-status-gold">
      <span className="font-mono tracking-wide">
        ⚠ DEV MODE — gates bypassed; demo shortcuts visible
      </span>
      <button
        onClick={toggle}
        className="text-[10px] underline hover:text-navy-1"
      >
        disable
      </button>
    </div>
  );
}
