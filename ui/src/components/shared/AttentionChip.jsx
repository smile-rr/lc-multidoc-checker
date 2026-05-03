import React from 'react';
import { ATTENTION_CHIPS } from '../../constants/attentionChips';

export function AttentionChip({ tag }) {
  const meta = ATTENTION_CHIPS[tag];
  if (!meta) return null;
  return (
    <span
      className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.label}
    </span>
  );
}
