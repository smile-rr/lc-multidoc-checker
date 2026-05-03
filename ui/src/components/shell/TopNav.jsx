import React from 'react';
import { Link } from 'react-router-dom';
import { useDevMode } from '../../context/DevModeContext';
import { HistoryDropdown } from './HistoryDropdown';

/**
 * Global top nav. Owns: brand, DEV pill, History, New Check.
 * Session-state display (id, status, event count, cancel) lives in SessionStatusBar.
 */
export function TopNav() {
  const { enabled: devOn, toggle: toggleDev } = useDevMode();

  return (
    <header className="bg-navy-1 border-b border-[#2c2c2e] px-6 h-10 flex items-center gap-5 shrink-0">
      <Link to="/" className="font-bold text-white text-sm tracking-wide hover:text-white/80">
        LC Checker <span className="text-teal-1">v2</span>
      </Link>
      <span className="text-white/40 text-xs">Multi-document UCP 600 Compliance</span>

      <nav className="ml-auto flex items-center gap-2">
        <button
          onClick={toggleDev}
          title={devOn ? 'Disable DEV MODE' : 'Enable DEV MODE — bypasses officer gates'}
          className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors
            ${devOn
              ? 'bg-status-gold/20 text-status-gold border-status-gold hover:bg-status-gold/30'
              : 'border-[#2c2c2e] text-white/50 hover:text-white hover:border-white/30'}`}
        >
          {devOn ? '⚡ DEV ON' : 'DEV'}
        </button>
        <HistoryDropdown />
        <Link to="/" className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded hover:bg-[#2c2c2e] transition-colors">
          New Check
        </Link>
      </nav>
    </header>
  );
}
