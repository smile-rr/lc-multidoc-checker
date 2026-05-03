import React from 'react';

const STAGES = [
  { key: 'intake',    label: 'Intake',    icon: '①' },
  { key: 'parse',     label: 'Parse',     icon: '②' },
  { key: 'reconcile', label: 'Reconcile', icon: '③' },
  { key: 'examine',   label: 'Examine',   icon: '④' },
  { key: 'signoff',   label: 'Sign-off',  icon: '⑤' },
];

/**
 * Gate-aware nav. `reachable` (Set) drives clickability; unreachable steps show
 * a 🔒 indicator. DEV MODE callers should pass a Set containing all 5 keys.
 */
export function PipelineNav({ activeStage, completedStages, reachable, onSelect }) {
  return (
    <nav className="flex items-center gap-0 bg-paper px-6 shrink-0">
      {STAGES.map((s, i) => {
        const done = completedStages?.has(s.key);
        const active = activeStage === s.key;
        const canClick = !reachable || reachable.has(s.key) || done;
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => canClick && onSelect?.(s.key)}
              disabled={!canClick}
              title={canClick ? '' : 'Complete the prior stage gate first'}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors
                ${active
                  ? 'border-b-teal-1 text-teal-1'
                  : done
                    ? 'border-b-status-green text-status-green hover:border-b-teal-1'
                    : canClick
                      ? 'border-b-transparent text-muted hover:border-b-navy-1 hover:text-navy-1'
                      : 'border-b-transparent text-line cursor-not-allowed'}`}
            >
              <span>{done ? '✓' : !canClick ? '🔒' : s.icon}</span>
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
