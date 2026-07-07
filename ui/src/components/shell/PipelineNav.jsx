import React from 'react';
import { UI_PIPELINE_STAGES } from '../../constants/pipelineStages';

/**
 * Gate-aware stage breadcrumb. Visual states:
 *   - Active (currently viewing): teal underline + slate2 background — pops as "I am here"
 *   - Completed (done, not viewing): green ✓ + green text, NO underline — calm
 *   - Reachable but not visited: muted, no decoration
 *   - Unreachable: 🔒, very faint, not clickable
 */
export function PipelineNav({ activeStage, completedStages, reachable, onSelect }) {
  return (
    <nav className="flex items-center gap-0 bg-paper px-6 shrink-0">
      {UI_PIPELINE_STAGES.map((s, i) => {
        const done = completedStages?.has(s.key);
        const active = activeStage === s.key;
        const canClick = !reachable || reachable.has(s.key) || done;

        const base = 'flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors';
        let stateCls;
        if (active) {
          stateCls = 'border-b-2 border-b-teal-1 text-teal-1 bg-slate2 font-semibold';
        } else if (done) {
          stateCls = 'border-b-2 border-b-transparent text-status-green hover:text-teal-1 hover:bg-slate2';
        } else if (canClick) {
          stateCls = 'border-b-2 border-b-transparent text-muted hover:text-navy-1 hover:bg-slate2';
        } else {
          stateCls = 'border-b-2 border-b-transparent text-line cursor-not-allowed';
        }

        const labelCls = s.key === 'compliance-check'
          ? 'hidden sm:inline'
          : '';
        const shortLabel = s.key === 'compliance-check' ? 'Compliance' : s.label;

        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => canClick && onSelect?.(s.key)}
              disabled={!canClick}
              title={canClick ? s.label : 'Complete the prior stage gate first'}
              className={`${base} ${stateCls}`}
            >
              <span>{!canClick ? '🔒' : done && !active ? '✓' : s.icon}</span>
              <span className={labelCls}>{s.label}</span>
              {s.key === 'compliance-check' && (
                <span className="sm:hidden">{shortLabel}</span>
              )}
            </button>
            {i < UI_PIPELINE_STAGES.length - 1 && (
              <span className="text-line text-xs">›</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
