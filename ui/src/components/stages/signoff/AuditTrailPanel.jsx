import React from 'react';

export function AuditTrailPanel({ session, totalRules, overrides, agentFlags }) {
  return (
    <div className="bg-white border border-line rounded-[10px] p-4">
      <div className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">AUDIT TRAIL</div>
      <div className="text-[11px] space-y-1.5 font-mono">
        <Row label="Session" value={session?.id?.slice(0, 8) ?? '—'} />
        <Row label="Status"  value={session?.status ?? '—'} />
        <Row label="Documents" value={session?.documents?.length ?? 0} />
        <Row label="Rules applied" value={totalRules} />
        <Row label="Overrides" value={overrides ?? 0} />
        <Row label="Agent flags" value={agentFlags ?? 0} />
        <Row label="Frameworks" value="UCP 600 · ISBP 821" />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
