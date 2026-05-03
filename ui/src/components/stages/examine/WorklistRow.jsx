import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SeverityChip } from '../../shared/SeverityChip';
import { ReliabChip } from '../../shared/ReliabChip';
import { AttentionChip } from '../../shared/AttentionChip';

const STATUS_META = {
  PASS:           { c: '#1a7a43', bg: '#f0fdf4', icon: '✓' },
  FAIL:           { c: '#cc0011', bg: '#fff1f0', icon: '✕' },
  DOUBTS:         { c: '#8a5700', bg: '#fefce8', icon: '!' },
  NOT_APPLICABLE: { c: '#6e6e73', bg: '#f5f5f7', icon: '○' },
};

export function WorklistRow({ rule, selected, onClick }) {
  const effective = rule.effectiveVerdict || rule.verdict;
  const meta = STATUS_META[effective] || STATUS_META.PASS;
  return (
    <tr
      onClick={onClick}
      className={`border-b border-line/50 cursor-pointer hover:bg-slate2 ${selected ? 'bg-status-greenSoft' : ''}`}
    >
      <td className="px-2 py-2 text-center" style={{ width: 24 }}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold"
              style={{ color: meta.c, background: meta.bg }}>
          {meta.icon}
        </span>
      </td>
      <td className="px-2 py-2 text-[10px] text-muted whitespace-nowrap font-mono">{rule.article}</td>
      <td className="px-2 py-2 text-[10px] font-mono">
        {(rule.scope || []).map(s => {
          const t = docTypeMeta(s);
          return (
            <span
              key={s}
              className="mr-0.5 px-1 py-0.5 rounded text-[9px]"
              style={{ background: t.color + '12', color: t.color }}
            >
              {t.short}
            </span>
          );
        })}
      </td>
      <td className="px-2 py-2 text-[12px]">
        <span className="text-[10px] text-[#a1a1a6] mr-1.5 font-mono">{rule.ruleId}</span>
        {rule.label}
      </td>
      <td className="px-2 py-2"><SeverityChip severity={rule.severity} /></td>
      <td className="px-2 py-2 text-[10px] text-muted font-mono">{rule.source}</td>
      <td className="px-2 py-2 text-[10px] font-mono">{rule.agree}</td>
      <td className="px-2 py-2"><ReliabChip r={rule.reliab} /></td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {(rule.attention || []).map(t => <AttentionChip key={t} tag={t} />)}
        </div>
      </td>
    </tr>
  );
}
