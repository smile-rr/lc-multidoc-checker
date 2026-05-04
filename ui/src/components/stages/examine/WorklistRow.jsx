import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SeverityChip } from '../../shared/SeverityChip';
import { ReliabChip } from '../../shared/ReliabChip';
import { AttentionChip } from '../../shared/AttentionChip';

function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Verdict visual taxonomy. Three coupled signals per row:
 *
 *   1. Left-edge bar (4px) — strongest, visible at-a-glance even when scanning
 *      a 50-row worklist. Solid color = the verdict.
 *   2. Status pill in column 1 — icon + 4–5 char label in a tinted chip.
 *      Color + shape (icon glyph) ensures colorblind-safe parsing.
 *   3. Row background tint — only for FAIL / FAILED, very subtle, draws the
 *      eye to rows that need triage without overwhelming.
 *
 * Glyphs are intentionally distinct shapes (●, ▲, ◐, ○, —, ⟳, ✕) so the row
 * is parseable in monochrome too.
 */
const STATUS_META = {
  PASS:           { fg: '#1a7a43', bg: '#ecfdf5', bar: '#1a7a43', icon: '●', label: 'PASS',  rowTint: '' },
  FAIL:           { fg: '#cc0011', bg: '#fee2e2', bar: '#cc0011', icon: '▲', label: 'FAIL',  rowTint: 'bg-red-50/40' },
  DOUBTS:         { fg: '#8a5700', bg: '#fef9c3', bar: '#d97706', icon: '◐', label: 'DOUBT', rowTint: '' },
  NOT_APPLICABLE: { fg: '#6e6e73', bg: '#f4f4f5', bar: '#a1a1aa', icon: '○', label: 'N/A',   rowTint: '' },
  FAILED:         { fg: '#b54708', bg: '#ffedd5', bar: '#b54708', icon: '✕', label: 'ERROR', rowTint: 'bg-orange-50/50' },
  PENDING:        { fg: '#a1a1a6', bg: '#f4f4f5', bar: '#d4d4d8', icon: '⟳', label: '…',     rowTint: '' },
};

export function WorklistRow({ rule, selected, onClick }) {
  const effective = rule.effectiveVerdict || rule.verdict;
  const isPending = effective === 'PENDING';
  const meta = STATUS_META[effective] || STATUS_META.NOT_APPLICABLE;
  return (
    <tr
      onClick={onClick}
      className={`border-b border-line/50 cursor-pointer transition-colors
        ${selected ? 'bg-status-greenSoft' : meta.rowTint || 'hover:bg-slate2'}
        ${isPending ? 'text-muted' : ''}`}
      style={{ boxShadow: `inset 4px 0 0 0 ${meta.bar}` }}
    >
      <td className="pl-3 pr-2 py-2" style={{ width: 80 }}>
        <span
          className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold tracking-wider
            ${isPending ? 'animate-pulse' : ''}`}
          style={{ color: meta.fg, background: meta.bg }}
        >
          <span className={`text-[11px] leading-none ${isPending ? 'animate-spin' : ''}`}>{meta.icon}</span>
          <span>{meta.label}</span>
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
        {rule.origin === 'ADHOC' && (
          <span
            className="mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-status-gold/20 text-status-gold border border-status-gold/40 inline-flex items-center gap-1"
            title={`AI-suggested rule — derived by the planner from this LC clause: ${(rule.evidenceLcClause || '').slice(0, 100)}${rule.evidenceLcClause && rule.evidenceLcClause.length > 100 ? '…' : ''}`}
          >
            <span className="text-[7px] leading-none">✦</span>
            <span>AI PLAN</span>
          </span>
        )}
        {rule.label}
      </td>
      <td className="px-2 py-2"><SeverityChip severity={rule.severity} /></td>
      <td className="px-2 py-2 text-[10px] text-muted font-mono">
        {rule.source}
        {rule.durationMs != null && (
          <span className="ml-1.5 text-[9px] text-[#a1a1a6]" title="Backend-measured execution time">
            {fmtDuration(rule.durationMs)}
          </span>
        )}
      </td>
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
