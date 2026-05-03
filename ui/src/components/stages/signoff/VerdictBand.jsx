import React from 'react';

const TONE = {
  ACCEPT:  { c: '#1a7a43', bg: '#f0fdf4', label: 'DOCUMENTS COMPLIANT', icon: '✓' },
  WAIVER:  { c: '#0066cc', bg: '#eff6ff', label: 'DISCREPANT · WAIVER PENDING', icon: '?' },
  REFUSE:  { c: '#cc0011', bg: '#fff1f0', label: 'DOCUMENTS REFUSED', icon: '✕' },
  PENDING: { c: '#6e6e73', bg: '#f5f5f7', label: 'AWAITING DECISION', icon: '?' },
};

export function VerdictBand({ decision, failures, doubts, lowConfPasses }) {
  const t = TONE[decision] || TONE.PENDING;
  return (
    <div className="border rounded-[10px] p-5" style={{ borderColor: t.c, background: t.bg }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: t.c, color: 'white' }}>
          <span className="text-[20px]">{t.icon}</span>
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.2em] uppercase font-semibold font-mono"
            style={{ color: t.c }}
          >
            PROVISIONAL VERDICT
          </div>
          <div className="text-[18px] font-semibold tracking-tight" style={{ color: t.c }}>
            {t.label}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] tracking-wider text-muted font-mono">FINDINGS</div>
          <div className="text-[12px] font-mono">
            <span className="text-status-red font-bold">{failures}</span> discrep. ·
            <span className="text-status-gold font-bold ml-1">{doubts}</span> doubts ·
            <span className="text-status-gold font-bold ml-1">{lowConfPasses}</span> review-worthy
          </div>
        </div>
      </div>
    </div>
  );
}
