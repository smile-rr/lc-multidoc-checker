import React from 'react';

const SCOPES = [
  { id: 'rules', label: 'Rules' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'fields', label: 'Fields' },
  { id: 'history', label: 'History' },
  { id: 'all', label: 'All' },
];

export function TopicChips({ scope, onChange }) {
  return (
    <div className="topic-chips" role="radiogroup" aria-label="Assistant scope">
      <span className="scope-label">Scope —</span>
      {SCOPES.map((s) => (
        <button
          key={s.id}
          className="topic-chip"
          role="radio"
          aria-pressed={scope === s.id}
          aria-checked={scope === s.id}
          onClick={() => onChange(s.id)}
        >
          <span className="topic-chip-disk" />
          {s.label}
        </button>
      ))}
    </div>
  );
}
