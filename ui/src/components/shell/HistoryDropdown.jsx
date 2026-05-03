import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSessions } from '../../api';

export function HistoryDropdown() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wrapRef = useRef(null);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listSessions(20);
      setSessions(rows);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function handleRowClick(s) {
    setOpen(false);
    nav(`/session/${s.id}`);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1 rounded text-xs ${open ? 'bg-[#2c2c2e]' : 'hover:bg-[#2c2c2e]'} text-white/70 hover:text-white transition-colors`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        History
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-[400px] max-h-[70vh] overflow-y-auto bg-white text-navy-1 rounded border border-line shadow-xl z-50"
        >
          <div className="px-3 py-2 border-b border-line flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted font-medium">Recent sessions</span>
            <button
              onClick={(e) => { e.stopPropagation(); void load(); }}
              disabled={loading}
              aria-label="Refresh"
              className="text-xs text-muted hover:text-navy-1 disabled:opacity-40 p-1 -m-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={loading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>

          {sessions === null && !error && (
            <div className="px-3 py-6 text-sm text-muted text-center">Loading…</div>
          )}
          {error && (
            <div className="px-3 py-6 text-sm text-status-red text-center">Failed: {error}</div>
          )}
          {sessions?.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted text-center">No sessions yet.</div>
          )}

          {sessions?.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              onClick={() => handleRowClick(s)}
              className="w-full text-left px-3 py-2.5 border-b border-line/60 last:border-0 hover:bg-slate-50 flex items-start gap-2.5"
            >
              <StatusDot status={s.status} compliant={s.compliant} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium truncate flex-1">{displayName(s)}</div>
                  <SessionProgressBadge session={s} />
                </div>
                <div className="text-xs text-muted truncate mt-0.5">
                  {s.beneficiary_name ?? '—'}
                </div>
                <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
                  <span>{relativeTime(s.created_at)}</span>
                  {s.doc_count > 0 && <span>· {s.doc_count} doc{s.doc_count !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function displayName(s) {
  if (s.lc_number?.trim()) return s.lc_number;
  return `#${String(s.id).slice(0, 8)}`;
}

/** Compact "where did this session get to" badge for the History list. */
function SessionProgressBadge({ session }) {
  const { status, compliant, next_stage, awaiting_officer } = session;
  if (status === 'COMPLETED') {
    const tone = compliant === true ? 'bg-status-greenSoft text-status-green'
      : compliant === false ? 'bg-status-redSoft text-status-red'
      : 'bg-status-goldSoft text-status-gold';
    const lbl = compliant === true ? 'COMPLIANT' : compliant === false ? 'DISCREPANT' : 'COMPLETED';
    return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${tone}`}>{lbl}</span>;
  }
  if (status === 'FAILED') {
    return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-status-redSoft text-status-red">FAILED</span>;
  }
  if (awaiting_officer && next_stage) {
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-slate2 text-muted" title="Awaiting officer to trigger next stage">
        ▸ {next_stage}
      </span>
    );
  }
  // Mid-stage running
  return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-teal-1/15 text-teal-1">{status?.toLowerCase()}</span>;
}

function StatusDot({ status, compliant }) {
  let cls = 'bg-[#a1a1a6]';
  if (status === 'RUNNING') cls = 'bg-teal-500 animate-pulse';
  else if (status === 'FAILED') cls = 'bg-red-400';
  else if (status === 'COMPLETED') cls = compliant === true ? 'bg-green-400' : 'bg-amber-400';
  return <span className={`flex-none w-2 h-2 rounded-full mt-2 ${cls}`} />;
}

function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
