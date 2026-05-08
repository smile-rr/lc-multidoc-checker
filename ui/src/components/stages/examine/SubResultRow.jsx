import React from 'react';

/**
 * Inline child row under a parent rule that returned condition_results[].
 * Used by COND-47A and any future AGENTIC rule that aggregates sub-checks.
 *
 * Indented under the parent (left rail uses parent's verdict bar colour) and
 * shows: condition_id · verdict pill · condition_text · severity. Source quote
 * full-width on the second line for prose readability.
 */
const STATUS_META = {
  PASS:           { fg: '#1a7a43', bg: '#ecfdf5', icon: '●' },
  FAIL:           { fg: '#cc0011', bg: '#fee2e2', icon: '▲' },
  DOUBTS:         { fg: '#8a5700', bg: '#fef9c3', icon: '◐' },
  NEEDS_REVIEW:   { fg: '#8a5700', bg: '#fef9c3', icon: '◐' },
  NOT_APPLICABLE: { fg: '#6e6e73', bg: '#f4f4f5', icon: '○' },
  FAILED:         { fg: '#b54708', bg: '#ffedd5', icon: '✕' },
};

const SEV_TONE = {
  CRITICAL: 'text-status-red font-semibold',
  MAJOR:    'text-navy-1',
  MINOR:    'text-muted',
};

const KIND_TONE = {
  PROG:         { fg: '#1e4e8c', bg: '#e0ecff' },
  AGENT:        { fg: '#5b21b6', bg: '#ede9fe' },
  OUT_OF_SCOPE: { fg: '#6e6e73', bg: '#f4f4f5' },
};

export function SubResultRow({ parentRuleId, sub, parentBarColor }) {
  const verdict = String(sub.verdict || 'NOT_APPLICABLE').toUpperCase();
  const meta = STATUS_META[verdict] || STATUS_META.NOT_APPLICABLE;
  const severity = sub.severity ? String(sub.severity).toUpperCase() : null;
  const kind = sub.check_kind ? String(sub.check_kind).toUpperCase() : null;
  const kindTone = KIND_TONE[kind] || null;
  const condId = sub.condition_id || sub.sub_id || '—';
  const text = sub.condition_text || sub.source_text || '';
  const explanation = sub.explanation || '';

  return (
    <tr
      className="border-b border-line/30 bg-paper hover:bg-slate2/40"
      style={{ boxShadow: `inset 4px 0 0 0 ${parentBarColor}` }}
      title={`Sub-condition of ${parentRuleId}`}
    >
      <td className="pl-3 pr-2 py-1.5 text-[9px] text-[#c0c0c4] font-mono" style={{ width: 40 }}>
        └
      </td>
      <td className="px-2 py-1.5 text-[9px] text-muted font-mono whitespace-nowrap">
        {condId}
      </td>
      <td className="px-2 py-1.5" style={{ width: 92 }}>
        <span
          className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono text-[9.5px] font-semibold tracking-wider"
          style={{ color: meta.fg, background: meta.bg }}
        >
          <span className="text-[10px] leading-none">{meta.icon}</span>
          <span>{verdict.replace('NOT_APPLICABLE', 'N/A').replace('NEEDS_REVIEW', 'REVIEW').replace('FAILED', 'ERROR')}</span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-[11px]" colSpan={3}>
        <div className="flex items-baseline gap-2 flex-wrap">
          {kindTone && (
            <span
              className="font-mono text-[8.5px] tracking-wider px-1 py-px rounded"
              style={{ color: kindTone.fg, background: kindTone.bg }}
            >
              {kind}
            </span>
          )}
          <span className="text-navy-1 italic font-serif leading-snug" style={{ fontStyle: 'italic' }}>
            “{text}”
          </span>
        </div>
        {explanation && (
          <div className="mt-0.5 text-[10.5px] text-muted leading-snug">{explanation}</div>
        )}
      </td>
      <td className={`px-2 py-1.5 text-[9.5px] font-mono tracking-wider whitespace-nowrap ${SEV_TONE[severity] || 'text-muted'}`}>
        {severity || ''}
      </td>
      <td className="pr-3 pl-1 py-1.5 text-right text-[9px] text-[#c0c0c4] font-mono">
        {sub.confidence != null ? `${(Number(sub.confidence) * 100).toFixed(0)}%` : ''}
      </td>
    </tr>
  );
}
