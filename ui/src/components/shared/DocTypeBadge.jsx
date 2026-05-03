import React from 'react';
import { docTypeMeta } from '../../constants/docTypes';

/** Coloured short-code chip for a DocType. */
export function DocTypeBadge({ type, withName = false }) {
  const t = docTypeMeta(type);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold font-mono px-1.5 py-0.5 rounded"
      style={{ color: t.color, background: t.color + '12' }}
      title={t.name}
    >
      <span>{t.icon}</span>
      <span>{t.short}</span>
      {withName && <span className="ml-1 text-[10px] normal-case font-normal">{t.name}</span>}
    </span>
  );
}
