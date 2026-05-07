import React from 'react';

export function ReasoningRibbon({ steps }) {
  if (!steps || !steps.length) return null;
  const label = steps[steps.length - 1] || 'thinking';
  return (
    <div className="reasoning-ribbon" aria-live="polite">
      <span>{label}…</span>
      <span className="reasoning-ribbon-bar" />
    </div>
  );
}
