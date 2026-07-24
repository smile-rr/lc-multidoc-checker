import React from 'react';
import { UploadTypeBadge } from './UploadTypeBadge';

/** Single file row — same look on default list and narrow left nav. */
export function UploadFileRow({
  item,
  selected = false,
  showViewHint = false,
  onActivate,
  onRemove,
}) {
  const interactive = Boolean(onActivate);

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.();
        }
      } : undefined}
      className={`flex items-center gap-2 bg-paper rounded border px-3 py-2 min-w-0
        ${selected ? 'border-teal-1 ring-1 ring-teal-1/30' : 'border-line'}
        ${interactive ? 'cursor-pointer hover:border-[#a1a1a6] hover:bg-slate2/50' : ''}`}
    >
      <UploadTypeBadge type={item.detectedType} />
      <span className="text-[11px] text-navy-1 flex-1 truncate font-mono min-w-0">
        {item.file.name}
      </span>
      <span className="text-[10px] text-[#a1a1a6] shrink-0 tabular-nums">
        {(item.file.size / 1024).toFixed(0)} KB
      </span>
      {showViewHint && (
        <span className="text-[9px] text-teal-1 font-mono shrink-0">view</span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        className="text-[#a1a1a6] hover:text-status-red text-[10px] shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
