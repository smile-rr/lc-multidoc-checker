import React, { useState } from 'react';
import { Mt734Preview } from './Mt734Preview';

const TONE = {
  ACCEPT:  { c: '#1a7a43', bg: '#f0fdf4', label: 'DOCUMENTS COMPLIANT', icon: '✓' },
  WAIVER:  { c: '#0066cc', bg: '#eff6ff', label: 'DISCREPANT · WAIVER PENDING', icon: '?' },
  REFUSE:  { c: '#cc0011', bg: '#fff1f0', label: 'DOCUMENTS REFUSED', icon: '✕' },
};

/** Immutable post-sign-off page. */
export function SignedRecordView({ session, record, fetchMt734, onBack }) {
  const decision = record?.decision || 'ACCEPT';
  const t = TONE[decision] || TONE.ACCEPT;
  const officer = record?.officer_id || '—';
  const signedAt = record?.signed_at ? formatTs(record.signed_at) : new Date().toISOString().slice(0, 16).replace('T', ' ');
  const [showMt734, setShowMt734] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const onMt734Toggle = async () => {
    setShowMt734(o => !o);
    if (!showMt734 && advice == null) {
      setLoadingAdvice(true);
      try { setAdvice(await fetchMt734()); }
      catch { setAdvice('(failed to fetch)'); }
      finally { setLoadingAdvice(false); }
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ session, record }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lc-v2-record-${(session?.id ?? 'export').slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 grid place-items-center bg-slate2 px-6 overflow-auto">
        <div className="max-w-[640px] text-center py-12">
          <div className="w-14 h-14 mx-auto rounded-full grid place-items-center mb-4"
               style={{ background: t.bg, color: t.c }}>
            <span className="text-[28px]">{t.icon}</span>
          </div>
          <div className="text-[10px] tracking-[0.25em] uppercase mb-2 font-mono" style={{ color: t.c }}>
            SIGNED OFF · IMMUTABLE
          </div>
          <h2 className="text-[24px] font-semibold tracking-tight mb-2">{t.label}</h2>
          <div className="text-[12px] text-muted font-mono">
            {(session?.id ?? '').slice(0, 8)} · {officer} · {signedAt}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={exportJson}
              className="px-3 py-1.5 rounded text-[12px] border border-line bg-white hover:bg-slate2"
            >
              ⤓ Export JSON
            </button>
            {decision === 'REFUSE' && (
              <button
                onClick={onMt734Toggle}
                className="px-3 py-1.5 rounded text-[12px] border border-status-red text-status-red bg-white hover:bg-status-redSoft"
              >
                {showMt734 ? 'Hide' : 'View'} MT734 advice
              </button>
            )}
            {onBack && (
              <button
                onClick={onBack}
                className="px-3 py-1.5 rounded text-[12px] text-muted hover:bg-white"
              >
                ↩ back to Examine
              </button>
            )}
          </div>
          {decision === 'REFUSE' && showMt734 && (
            <div className="mt-6 text-left">
              <Mt734Preview open={true} onToggle={onMt734Toggle} advice={advice} loading={loadingAdvice} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTs(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch { return String(s); }
}
