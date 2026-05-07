import React from 'react';
import { QUICK_PROMPTS } from './assistantEngine';

export function QuickPrompts({ onPick }) {
  return (
    <div className="quick-prompts">
      <span className="lead">try</span>
      {QUICK_PROMPTS.map((p, i) => (
        <React.Fragment key={p}>
          <button onClick={() => onPick(p)}>{p.toLowerCase()}</button>
          {i < QUICK_PROMPTS.length - 1 ? <span className="sep">·</span> : null}
        </React.Fragment>
      ))}
    </div>
  );
}
