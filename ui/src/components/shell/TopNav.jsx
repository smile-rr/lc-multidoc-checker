import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessionStatus } from '../../context/SessionStatusContext';
import { useDevMode } from '../../context/DevModeContext';
import { HistoryDropdown } from './HistoryDropdown';
import { cancelSession } from '../../api';

const OFFICER_ID = 'A. Wijaya';

export function TopNav() {
  const nav = useNavigate();
  const { runningInfo } = useSessionStatus();
  const { enabled: devOn, toggle: toggleDev } = useDevMode();
  const isRunning = runningInfo?.status === 'RUNNING';
  const [cancelling, setCancelling] = useState(false);

  const onCancel = async () => {
    if (!runningInfo?.id || cancelling) return;
    setCancelling(true);
    try { await cancelSession(runningInfo.id, OFFICER_ID); }
    catch (e) { console.error('cancel failed', e); }
    finally { setCancelling(false); }
  };

  return (
    <header className="bg-navy-1 border-b border-[#2c2c2e] px-6 py-3 flex items-center gap-4 shrink-0">
      <Link to="/" className="font-bold text-white text-sm tracking-wide hover:text-white/80">
        LC Checker <span className="text-teal-1">v2</span>
      </Link>
      <span className="text-white/40 text-xs">Multi-document UCP 600 Compliance</span>

      <nav className="ml-auto flex items-center gap-2">
        {isRunning && (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => nav(`/session/${runningInfo.id}`)}
              className="font-mono text-[11px] px-2 py-1 rounded bg-teal-1/15 text-teal-1 hover:bg-teal-1/30 inline-flex items-center gap-1.5"
              title={`Running: ${runningInfo.id}`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-1 animate-pulse" />
              <span>{String(runningInfo.id).slice(0, 8)} · running</span>
            </button>
            <button
              onClick={onCancel}
              disabled={cancelling}
              title="Soft cancel — current stage finishes, then pipeline stops"
              className="font-mono text-[11px] px-2 py-1 rounded border border-status-red text-status-red hover:bg-status-red/10 disabled:opacity-50"
            >
              {cancelling ? '⏳' : '⏹ cancel'}
            </button>
          </div>
        )}
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
