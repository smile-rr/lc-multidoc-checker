import React from 'react';
import { AttentionChip } from '../../shared/AttentionChip';

export function ReviewWorthyPasses({ rules }) {
  if (!rules || rules.length === 0) return null;
  return (
    <details className="bg-white border border-line rounded-[10px] group">
      <summary className="px-4 py-3 cursor-pointer flex items-center justify-between list-none">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-status-gold font-mono">
            REVIEW-WORTHY PASSES · {rules.length}
          </div>
          <div className="text-[12px]">
            Passes flagged for asymmetric-risk attention (low-conf · split agreement · handwriting)
          </div>
        </div>
        <span className="text-[11px] text-muted group-open:hidden">▾ expand</span>
        <span className="text-[11px] text-muted hidden group-open:inline">▴ collapse</span>
      </summary>
      <div className="border-t border-line/50 divide-y divide-line/50">
        {rules.map(r => (
          <div key={r.ruleId} className="px-4 py-2 text-[11px] flex items-center gap-2">
            <span className="text-[10px] text-muted w-12 font-mono">{r.ruleId}</span>
            <span className="text-[10px] text-muted w-24 font-mono">{r.article}</span>
            <span className="flex-1">{r.label}</span>
            {(r.attention || []).map(t => <AttentionChip key={t} tag={t} />)}
          </div>
        ))}
      </div>
    </details>
  );
}
