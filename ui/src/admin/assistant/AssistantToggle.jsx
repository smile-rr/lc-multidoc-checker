import React from 'react';
import { useAssistant } from './AssistantContext';

export function AssistantToggle() {
  const { state, toggleOpen } = useAssistant();
  const pending = state.patches.filter((p) => !p.applied).length;
  return (
    <button
      onClick={toggleOpen}
      aria-pressed={state.open}
      title={state.open ? 'Close Assistant (g a)' : 'Open Assistant (g a)'}
      className="relative inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-navy-1/70 hover:text-navy-1 px-2 py-1 border-l border-line/60"
      style={{ fontFamily: 'ui-serif, Georgia, serif', fontStyle: 'italic', textTransform: 'none', letterSpacing: '0.04em', fontSize: 12 }}
    >
      <span aria-hidden style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, color: state.open ? '#0a7e6a' : '#8a8a8f', letterSpacing: 0 }}>
        {state.open ? '◐' : '◑'}
      </span>
      assistant
      {pending > 0 && !state.open ? (
        <span style={{ marginLeft: 4, fontSize: 10, color: '#8a5700', fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0 }}>·{pending}</span>
      ) : null}
    </button>
  );
}
