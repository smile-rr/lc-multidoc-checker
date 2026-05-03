import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SeverityChip } from '../../shared/SeverityChip';
import { DispositionPill } from '../../shared/DispositionPill';

const DISP_OPTIONS = [
  ['WAIVER', 'Approach applicant for waiver'],
  ['CURED',  'Cured by amendment'],
  ['HOLD',   'Hold pending instructions'],
  ['REFUSE', 'Refuse this finding'],
];

export function DiscrepancyCard({ rule, disposition, onSet, onClear }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3 mb-2">
        <span className="w-5 h-5 rounded grid place-items-center bg-status-redSoft text-status-red text-[11px] font-bold flex-shrink-0 mt-0.5">
          ✕
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] text-muted font-mono">{rule.ruleId} · {rule.article}</span>
            <SeverityChip severity={rule.severity} />
            {(rule.scope || []).map(s => {
              const t = docTypeMeta(s);
              return (
                <span
                  key={s}
                  className="text-[9px] px-1 py-0.5 rounded font-mono"
                  style={{ background: t.color + '12', color: t.color }}
                >
                  {t.short}
                </span>
              );
            })}
            <DispositionPill d={disposition} />
          </div>
          <div className="text-[12px]">{rule.label}</div>
          {rule.explanation && (
            <div className="text-[11px] mt-1 text-muted">{rule.explanation}</div>
          )}
          {rule.evidence && (rule.evidence.lc != null || rule.evidence.doc != null) && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] font-mono">
              <div className="bg-slate2 rounded p-2 border border-line/50">
                <div className="text-[9px] tracking-wider text-teal-1 mb-1">LC SAYS</div>
                <div>{String(rule.evidence.lc ?? '—')}</div>
              </div>
              <div className="bg-slate2 rounded p-2 border border-line/50">
                <div className="text-[9px] tracking-wider text-status-blue mb-1">DOCUMENT SAYS</div>
                <div>{String(rule.evidence.doc ?? '—')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="ml-8 flex items-center gap-1 flex-wrap">
        {DISP_OPTIONS.map(([d, l]) => (
          <button
            key={d}
            onClick={() => onSet(rule.ruleId, d)}
            className={`text-[10px] px-2 py-1 rounded border
              ${disposition === d ? 'bg-navy-1 text-white border-navy-1' : 'border-line hover:bg-slate2'}`}
          >
            {l}
          </button>
        ))}
        {disposition !== 'PENDING' && (
          <button
            onClick={() => onClear(rule.ruleId)}
            title="Clear this disposition"
            className="text-[10px] px-2 py-1 rounded text-muted hover:bg-slate2 hover:text-navy-1 flex items-center gap-1 font-mono"
          >
            ↻ CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
