import React, { useState } from 'react';
import { SeverityChip } from '../../shared/SeverityChip';
import { AttentionChip } from '../../shared/AttentionChip';
import { EvidencePanel } from './EvidencePanel';
import { OverrideForm } from './OverrideForm';

const STATUS_META = {
  PASS:           { c: '#1a7a43', bg: '#f0fdf4', l: 'PASS' },
  FAIL:           { c: '#cc0011', bg: '#fff1f0', l: 'FAIL' },
  DOUBTS:         { c: '#8a5700', bg: '#fefce8', l: 'DOUBTS' },
  NOT_APPLICABLE: { c: '#6e6e73', bg: '#f5f5f7', l: 'N/A' },
};

export function RuleDrawer({ rule, onClose, onOverride, onResetOverride }) {
  const [overrideOpen, setOverrideOpen] = useState(false);

  if (!rule) return null;
  const effective = rule.effectiveVerdict || rule.verdict;
  const m = STATUS_META[effective] || STATUS_META.PASS;
  const ov = rule.override;

  return (
    <aside className="bg-white border-l border-line flex flex-col flex-shrink-0 overflow-hidden" style={{ width: 540 }}>
      <div className="px-5 py-3 border-b border-line flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-muted font-mono">{rule.ruleId}</span>
            <span className="text-[10px] text-muted font-mono">· {rule.article}</span>
            <span
              className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
              style={{ color: m.c, background: m.bg }}
            >
              {m.l}
            </span>
            <SeverityChip severity={rule.severity} />
          </div>
          <div className="text-[14px] font-semibold tracking-tight">{rule.label}</div>
          {(rule.attention || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {rule.attention.map(t => <AttentionChip key={t} tag={t} />)}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-[#a1a1a6] hover:text-navy-1 text-[16px] leading-none">✕</button>
      </div>

      <div className="flex-1 overflow-auto">
        {rule.origin === 'ADHOC' && rule.evidenceLcClause && (
          <div className="px-5 py-4 border-b border-line/50">
            <div className="text-[9px] tracking-[0.2em] uppercase text-status-gold mb-2 font-mono flex items-center gap-1">
              <span>★</span><span>LC EVIDENCE</span>
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap bg-slate2 border-l-2 border-status-gold pl-3 py-2 pr-2 rounded-sm text-navy-1">
              {rule.evidenceLcClause}
            </pre>
          </div>
        )}

        {effective === 'NOT_APPLICABLE' ? (
          <div className="px-5 py-4 border-b border-line/50">
            <div className="text-[9px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">WHY THIS RULE DIDN'T FIRE</div>
            {(rule.triggerTrace && rule.triggerTrace.length > 0) ? (
              <ul className="text-[11px] space-y-1 font-mono">
                {rule.triggerTrace.map((line, i) => (
                  <li key={i} className="text-navy-1">{line}</li>
                ))}
              </ul>
            ) : (
              <div className="text-[11px] text-muted">{rule.explanation || 'No trace available.'}</div>
            )}
          </div>
        ) : (
          <div className="px-5 py-4 border-b border-line/50">
            <div className="text-[9px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">EVIDENCE</div>
            <EvidencePanel evidence={rule.evidence} />
            {rule.explanation && (
              <div className="mt-3 text-[11px] border-l-2 border-status-gold pl-3 py-1 bg-status-goldSoft">
                <span className="text-[9px] tracking-wider uppercase text-status-gold font-mono">EXPLANATION · </span>
                {rule.explanation}
              </div>
            )}
          </div>
        )}

        {(rule.ucpRefs?.length > 0 || rule.isbpRefs?.length > 0) && (
          <div className="px-5 py-4 border-b border-line/50">
            <div className="text-[9px] tracking-[0.2em] uppercase text-muted mb-2 font-mono">CITATIONS</div>
            {(rule.ucpRefs || []).map(r => (
              <div key={r.id} className="text-[11px] mb-2">
                <span className="text-[9px] uppercase tracking-wider text-status-blue font-mono">UCP 600 · {r.article}{r.paragraph ? `(${r.paragraph})` : ''}</span>
                <div>{r.heading}</div>
                <div className="text-muted text-[11px] mt-0.5">{r.text}</div>
              </div>
            ))}
            {(rule.isbpRefs || []).map(r => (
              <div key={r.id} className="text-[11px] mb-2">
                <span className="text-[9px] uppercase tracking-wider text-status-blue font-mono">ISBP · {r.article}{r.paragraph ? `(${r.paragraph})` : ''}</span>
                <div>{r.heading}</div>
                <div className="text-muted text-[11px] mt-0.5">{r.text}</div>
              </div>
            ))}
          </div>
        )}

        {ov && (
          <div className="px-5 py-3 border-b border-line/50 bg-status-blueSoft">
            <div className="text-[9px] tracking-[0.2em] uppercase text-status-blue mb-1.5 font-mono">OFFICER OVERRIDE</div>
            <div className="text-[11px]"><b>{ov.newStatus}</b> · reason: {ov.reason}</div>
            {ov.note && <div className="text-[11px] mt-1">{ov.note}</div>}
            {ov.flagged && (
              <div className="mt-1.5">
                <AttentionChip tag="FLAGGED" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-line bg-slate2">
        {!overrideOpen ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setOverrideOpen(true)}
              className="px-3 py-1.5 rounded text-[11px] border border-line hover:bg-white"
            >
              ✎ Override verdict
            </button>
            <button
              onClick={() => { setOverrideOpen(true); }}
              className="px-3 py-1.5 rounded text-[11px] border border-status-red text-status-red hover:bg-status-redSoft"
            >
              ⚑ Flag agent error
            </button>
            {ov && (
              <button
                onClick={() => onResetOverride(rule.ruleId)}
                className="px-3 py-1.5 rounded text-[11px] border border-line text-muted hover:bg-white"
              >
                ↻ Reset to system verdict
              </button>
            )}
            <span className="ml-auto text-[10px] text-muted font-mono">audit trail captures all actions</span>
          </div>
        ) : (
          <OverrideForm
            ruleId={rule.ruleId}
            currentVerdict={rule.verdict}
            initialFlagged={ov?.flagged}
            onSubmit={async (body) => {
              await onOverride(rule.ruleId, body);
              setOverrideOpen(false);
            }}
            onCancel={() => setOverrideOpen(false)}
          />
        )}
      </div>
    </aside>
  );
}
