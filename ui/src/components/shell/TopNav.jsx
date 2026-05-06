import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDevMode } from '../../context/DevModeContext';
import { useConfirm } from '../../hooks/useConfirm';
import { HistoryDropdown } from './HistoryDropdown';

/**
 * Global top nav. Owns: brand, DEV pill, History, New Check, Governance.
 * Session-state display (id, status, event count, cancel) lives in SessionStatusBar.
 *
 * "New Check" + brand link mimic v1: solid teal when on `/`, ghost otherwise,
 * and gate navigation behind a confirm modal when an officer is currently
 * viewing a session — leaving discards the visual context (the session itself
 * stays in history and can be reopened).
 */
export function TopNav() {
  const { enabled: devOn, toggle: toggleDev } = useDevMode();
  const loc = useLocation();
  const nav = useNavigate();
  const { confirm, Dialog } = useConfirm();
  const onSession = loc.pathname.startsWith('/session/');

  async function leaveSession(e) {
    if (!onSession) return;
    e.preventDefault();
    const ok = await confirm({
      title: 'Leave the current session?',
      message:
        'You are viewing a compliance check session. Returning to the upload page will hide it from view.\n\n' +
        'The session itself stays in history — you can reopen it from History at any time.',
      confirmLabel: 'Leave session',
      cancelLabel: 'Stay here',
    });
    if (ok) nav('/');
  }

  return (
    <header className="bg-navy-1 border-b border-[#2c2c2e] px-6 h-10 flex items-center gap-5 shrink-0">
      <Link
        to="/"
        onClick={leaveSession}
        className="font-bold text-white text-sm tracking-wide hover:text-white/80"
      >
        LC Checker <span className="text-teal-1">v2</span>
      </Link>

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
        <Link
          to="/"
          onClick={leaveSession}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            !onSession
              ? 'bg-teal-1 text-white hover:bg-teal-2'
              : 'text-white/50 hover:text-white hover:bg-[#2c2c2e]'
          }`}
        >
          New Check
        </Link>
        <Link to="/admin" className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded hover:bg-[#2c2c2e] transition-colors">
          Governance
        </Link>
      </nav>
      {Dialog}
    </header>
  );
}
