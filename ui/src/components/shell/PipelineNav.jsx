import React from 'react';

const STAGES = [
  { key: 'intake',    label: 'Intake',    icon: '①' },
  { key: 'parse',     label: 'Parse',     icon: '②' },
  { key: 'reconcile', label: 'Reconcile', icon: '③' },
  { key: 'examine',   label: 'Examine',   icon: '④' },
  { key: 'signoff',   label: 'Sign-off',  icon: '⑤' },
];

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
      {STAGES.map((s, i) => {
        const done = completedStages?.has(s.key);
        const active = activeStage === s.key;
        const canClick = !reachable || reachable.has(s.key) || done;

        const base = 'flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors';
        let stateCls;
        if (active) {
          // The "you are here" state — strongest emphasis
          stateCls = 'border-b-2 border-b-teal-1 text-teal-1 bg-slate2 font-semibold';
        } else if (done) {
          // Completed but not currently viewing — calm green, no underline
          stateCls = 'border-b-2 border-b-transparent text-status-green hover:text-teal-1 hover:bg-slate2';
        } else if (canClick) {
          stateCls = 'border-b-2 border-b-transparent text-muted hover:text-navy-1 hover:bg-slate2';
        } else {
          stateCls = 'border-b-2 border-b-transparent text-line cursor-not-allowed';
        }

        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => canClick && onSelect?.(s.key)}
              disabled={!canClick}
              title={canClick ? '' : 'Complete the prior stage gate first'}
              className={`${base} ${stateCls}`}
            >
              <span>{!canClick ? '🔒' : done && !active ? '✓' : s.icon}</span>
              {s.label}
            </button>
            {i < STAGES.length - 1 && (
              <span className="text-line text-xs">›</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
