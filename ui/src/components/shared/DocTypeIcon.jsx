import React from 'react';
import { docTypeMeta } from '../../constants/docTypes';
import { formatPageLabel } from '../../lib/dealPages';

function iconPageBadge(dealTiffPages, pages) {
  const label = formatPageLabel(dealTiffPages);
  if (label) return label;
  if (pages != null) return String(pages);
  return null;
}

/** Larger icon tile used in Intake doc cards + Parse doc rail. */
export function DocTypeIcon({ type, size = 'md', pages, dealTiffPages }) {
  const t = docTypeMeta(type);
  const badge = iconPageBadge(dealTiffPages, pages);
  const sizes = {
    sm: 'w-8 h-10 text-[14px]',
    md: 'w-12 h-12 text-[18px]',
    lg: 'w-14 h-16 text-[20px]',
  };
  const cls = sizes[size] || sizes.md;
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[6px] border ${cls}`}
      style={{ borderColor: t.color + '40', color: t.color, background: t.color + '10' }}
      title={t.name}
    >
      <span>{t.icon}</span>
      {badge != null && (
        <span className="text-[8px] mt-0.5 font-mono opacity-80 leading-tight text-center px-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}
