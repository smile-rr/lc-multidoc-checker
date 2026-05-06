import React, { useEffect, useRef } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { AttentionChip } from '../../shared/AttentionChip';

const SEV_TONE = {
  CRITICAL:    'text-status-red font-semibold',
  MAJOR:       'text-navy-1',
  MINOR:       'text-muted',
  OBSERVATION: 'text-muted',
};

function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

const STATUS_META = {
  PASS:           { fg: '#1a7a43', bg: '#ecfdf5', bar: '#1a7a43', icon: '●', label: 'PASS' },
  FAIL:           { fg: '#cc0011', bg: '#fee2e2', bar: '#cc0011', icon: '▲', label: 'FAIL' },
  DOUBTS:         { fg: '#8a5700', bg: '#fef9c3', bar: '#d97706', icon: '◐', label: 'DOUBT' },
  NEEDS_REVIEW:   { fg: '#8a5700', bg: '#fef9c3', bar: '#d97706', icon: '◐', label: 'REVIEW' },
  NOT_APPLICABLE: { fg: '#6e6e73', bg: '#f4f4f5', bar: '#a1a1aa', icon: '○', label: 'N/A' },
  FAILED:         { fg: '#b54708', bg: '#ffedd5', bar: '#b54708', icon: '✕', label: 'ERROR' },
  PENDING:        { fg: '#a1a1a6', bg: '#f4f4f5', bar: '#d4d4d8', icon: '⟳', label: '…' },
};

const TIER_LABEL = {
  PROGRAMMATIC: 'PROG',
  AGENT:        'AGENT',
  AGENT_TOOL:   'AGENT+T',
  AGENTIC:      'AGENTIC',
};

export function WorklistRow({ rule, selected, onClick }) {
  const effective = rule.effectiveVerdict || rule.verdict;
  const isPending = effective === 'PENDING';
  const meta = STATUS_META[effective] || STATUS_META.NOT_APPLICABLE;
  const attention = rule.attention || [];

  // Keep the active row visible during keyboard ↑/↓ navigation. nearest-block
  // scrolls only when the row would otherwise be clipped.
  const rowRef = useRef(null);
  useEffect(() => {
    if (selected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  return (
    <tr
      ref={rowRef}
      onClick={onClick}
      className={`border-b border-line/50 cursor-pointer transition-colors
        ${selected ? 'bg-status-blueSoft' : 'hover:bg-slate2'}
        ${isPending ? 'text-muted' : ''}`}
      style={{
        boxShadow: selected
          ? `inset 4px 0 0 0 #0066cc, inset 0 0 0 1px #0066cc55`
          : `inset 4px 0 0 0 ${meta.bar}`,
      }}
    >
      {/* # */}
      <td className="pl-3 pr-2 py-2 text-[10px] text-[#a1a1a6] font-mono tabular-nums" style={{ width: 40 }}>
        {rule.seqNum != null ? rule.seqNum + 1 : ''}
      </td>

      {/* Article (UCP/ISBP) */}
      <td className="px-2 py-2 text-[10px] text-muted whitespace-nowrap font-mono">{rule.article}</td>

      {/* Verdict */}
      <td className="px-2 py-2" style={{ width: 92 }}>
        <span
          className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold tracking-wider
            ${isPending ? 'animate-pulse' : ''}`}
          style={{ color: meta.fg, background: meta.bg }}
        >
          <span className={`text-[11px] leading-none ${isPending ? 'animate-spin' : ''}`}>{meta.icon}</span>
          <span>{meta.label}</span>
        </span>
      </td>

      {/* Type (execution tier) */}
      <td className="px-2 py-2 text-[10px] text-muted font-mono whitespace-nowrap" style={{ width: 72 }} title={rule.checkType ? `Execution tier: ${rule.checkType}` : undefined}>
        {(rule.checkType && TIER_LABEL[rule.checkType]) || ''}
      </td>

      {/* Rule (id + label + inline attention chips) */}
      <td className="px-2 py-2 text-[12px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#a1a1a6] font-mono">{rule.ruleId}</span>
          <span className="text-navy-1 leading-snug">{rule.label}</span>
          {attention.map(t => <AttentionChip key={t} tag={t} />)}
        </div>
      </td>

      {/* Scope */}
      <td className="px-2 py-2 text-[10px] font-mono whitespace-nowrap">
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

      {/* Severity */}
      <td className={`px-2 py-2 text-[10px] font-mono tracking-wider whitespace-nowrap ${SEV_TONE[rule.severity] || 'text-muted'}`}>
        {rule.severity && rule.severity !== '—' ? rule.severity : ''}
      </td>

      {/* Took (duration, far right, small + muted) */}
      <td className="pr-3 pl-1 py-2 text-right text-[9.5px] text-[#a1a1a6] font-mono tabular-nums whitespace-nowrap" style={{ width: 56 }}>
        {fmtDuration(rule.durationMs)}
      </td>
    </tr>
  );
}
