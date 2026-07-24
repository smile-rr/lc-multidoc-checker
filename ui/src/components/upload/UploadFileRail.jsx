import React from 'react';
import { compareDocType } from '../../constants/docTypes';
import { isUploadPreviewable } from './uploadPreview';
import { UploadFileRow } from './UploadFileRow';

/**
 * Narrow left column — same file rows as the default list, reduced width only.
 */
export function UploadFileRail({ files, selectedIdx, onSelect, onRemove }) {
  const rows = files
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => isUploadPreviewable(item))
    .sort((a, b) => {
      const c = compareDocType(a.item.detectedType, b.item.detectedType);
      if (c !== 0) return c;
      return a.idx - b.idx;
    });

  return (
    <div className="w-56 shrink-0 min-w-0 flex flex-col gap-1 overflow-y-auto">
      {rows.map(({ item, idx }) => (
        <UploadFileRow
          key={idx}
          item={item}
          selected={selectedIdx === idx}
          onActivate={() => onSelect(idx)}
          onRemove={() => onRemove(idx)}
        />
      ))}
    </div>
  );
}
