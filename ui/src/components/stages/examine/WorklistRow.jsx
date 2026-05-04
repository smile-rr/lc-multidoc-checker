import React, { useEffect, useRef } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SeverityChip } from '../../shared/SeverityChip';
import { AttentionChip } from '../../shared/AttentionChip';

function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

const STATUS_META = {
  PASS:           { fg: '#1a7a43', bg: '#ecfdf5', bar: '#1a7a43', icon: '●', label: 'PASS',  rowTint: '' },
  FAIL:           { fg: '#cc0011', bg: '#fee2e2', bar: '#cc0011', icon: '▲', label: 'FAIL',  rowTint: 'bg-red-50/40' },
  DOUBTS:         { fg: '#8a5700', bg: '#fef9c3', bar: '#d97706', icon: '◐', label: 'DOUBT', rowTint: '' },
  NEEDS_REVIEW:   { fg: '#8a5700', bg: '#fef9c3', bar: '#d97706', icon: '◐', label: 'REVIEW',rowTint: '' },
  NOT_APPLICABLE: { fg: '#6e6e73', bg: '#f4f4f5', bar: '#a1a1aa', icon: '○', label: 'N/A',   rowTint: '' },
  FAILED:         { fg: '#b54708', bg: '#ffedd5', bar: '#b54708', icon: '✕', label: 'ERROR', rowTint: 'bg-orange-50/50' },
  PENDING:        { fg: '#a1a1a6', bg: '#f4f4f5', bar: '#d4d4d8', icon: '⟳', label: '…',     rowTint: '' },
};

const TIER_META = {
  PROGRAMMATIC: { label: 'PROG',    fg: '#0f5c3e', bg: '#d1fae5' },
  AGENT:        { label: 'AGENT',   fg: '#1e40af', bg: '#dbeafe' },
  AGENT_TOOL:   { label: 'AGENT+T', fg: '#6b21a8', bg: '#ede9fe' },
  AGENTIC:      { label: 'AGENTIC', fg: '#9a3412', bg: '#ffedd5' },
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
        ${selected ? 'bg-status-greenSoft' : meta.rowTint || 'hover:bg-slate2'}
        ${isPending ? 'text-muted' : ''}`}
      style={{ boxShadow: `inset 4px 0 0 0 ${meta.bar}` }}
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

      {/* Rule (id + tier + label + inline attention chips) */}
      <td className="px-2 py-2 text-[12px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#a1a1a6] font-mono">{rule.ruleId}</span>
          {rule.checkType && TIER_META[rule.checkType] && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold inline-flex items-center"
              style={{ color: TIER_META[rule.checkType].fg, background: TIER_META[rule.checkType].bg }}
              title={`Execution tier: ${rule.checkType}`}
            >
              {TIER_META[rule.checkType].label}
            </span>
          )}
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
      <td className="px-2 py-2"><SeverityChip severity={rule.severity} /></td>

      {/* Source — just the model/source label, duration moved to row tail */}
      <td className="px-2 py-2 text-[10px] text-muted font-mono whitespace-nowrap" title={rule.source}>
        {rule.source || '—'}
      </td>

      {/* Took (duration, far right, small + muted) */}
      <td className="pr-3 pl-1 py-2 text-right text-[9.5px] text-[#a1a1a6] font-mono tabular-nums whitespace-nowrap" style={{ width: 56 }}>
        {fmtDuration(rule.durationMs)}
      </td>
    </tr>
  );
}
