import React from 'react';

export function UploadTypeBadge({ type }) {
  const isLC = type === 'LC';
  const isDeal = type === 'DEAL';
  const isUnknown = type === 'UNKNOWN' || type === 'OTHER' || type === 'TXT';
  const cls = isLC
    ? 'bg-teal-1/15 text-teal-1'
    : isDeal
      ? 'bg-indigo-50 text-indigo-600'
      : isUnknown
        ? 'bg-status-goldSoft text-status-gold'
        : 'bg-status-blueSoft text-status-blue';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-mono ${cls}`}>
      {isDeal ? 'DEAL' : type}
    </span>
  );
}
