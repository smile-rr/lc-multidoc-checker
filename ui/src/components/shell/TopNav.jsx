import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDevMode } from '../../context/DevModeContext';
import { useUploadDraft } from '../../context/UploadDraftContext';
import { useConfirm } from '../../hooks/useConfirm';
import { HistoryDropdown } from './HistoryDropdown';

/**
 * Global top nav. Owns: brand, DEV pill, History, New Check, Governance.
 *
 * "New Check" rules:
 *   - Same outlined-teal style on every route — primary nav action,
 *     not a state-dependent pill.
 *   - On a session route → confirm leave (visual context dropped, session
 *     stays in History).
 *   - On the upload route with a staged draft (files dropped but not
 *     submitted) → confirm discard, then clear the draft.
 *   - On the upload route with no draft → no-op (user is already there).
 *
 * Brand link follows the same gating so the two paths to "go home" agree.
 */
export function TopNav() {
  const { enabled: devOn, toggle: toggleDev } = useDevMode();
  const { hasDraft, clearDraft } = useUploadDraft();
  const loc = useLocation();
  const nav = useNavigate();
  const { confirm, Dialog } = useConfirm();
  const onSession = loc.pathname.startsWith('/session/');
  const onHome = loc.pathname === '/';

  async function startNewCheck(e) {
    e?.preventDefault();
    if (onSession) {
      const ok = await confirm({
        title: 'Leave the current session?',
        message:
          'You are viewing a compliance check session. Returning to the upload page will hide it from view.\n\n' +
          'The session itself stays in history — you can reopen it from History at any time.',
        confirmLabel: 'Leave session',
        cancelLabel: 'Stay here',
      });
      if (ok) nav('/');
      return;
    }
    if (onHome && hasDraft) {
      const ok = await confirm({
        title: 'Start a new check?',
        message:
          'You have files staged on the upload page that haven\'t been submitted yet.\n\n' +
          'Starting a new check will discard the current selection.',
        confirmLabel: 'Discard & start new',
        cancelLabel: 'Keep current files',
        tone: 'danger',
      });
      if (ok) clearDraft();
      return;
    }
    if (!onHome) nav('/');
  }

  return (
    <header className="bg-navy-1 border-b border-[#2c2c2e] px-6 h-10 flex items-center gap-5 shrink-0">
      <a
        href="/"
        onClick={startNewCheck}
        className="font-bold text-white text-sm tracking-wide hover:text-white/80"
      >
        LC Checker <span className="text-teal-1">v2</span>
      </a>

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
        <button
          onClick={startNewCheck}
          className="text-xs px-2.5 py-1 rounded border border-teal-1 text-teal-1 bg-transparent hover:bg-teal-1 hover:text-white transition-colors"
        >
          New Check
        </button>
        <Link to="/admin" className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded hover:bg-[#2c2c2e] transition-colors">
          Governance
        </Link>
      </nav>
      {Dialog}
    </header>
  );
}
