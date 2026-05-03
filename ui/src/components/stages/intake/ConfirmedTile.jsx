import React, { useState } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { TypePickerMenu } from '../../shared/TypePickerMenu';
import { DocTypeIcon } from '../../shared/DocTypeIcon';

/** Compact, quiet tile for confirmed-type docs. */
export function ConfirmedTile({ doc, onTypeChange, disabled }) {
  const t = docTypeMeta(doc.doc_type);
  const [picking, setPicking] = useState(false);

  return (
    <div className={`border border-line rounded-[10px] bg-white p-3 flex items-center gap-3 hover:border-[#a1a1a6] relative ${picking ? 'z-30' : ''}`}>
      <DocTypeIcon type={doc.doc_type} pages={doc.page_count} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase font-semibold font-mono"
                style={{ color: t.color }}>
            {t.short}
          </span>
          <span className="text-[10px] text-status-green flex items-center gap-0.5 font-mono">
            ✓ confirmed
          </span>
          {doc.parse_status === 'EXTRACTED' && (
            <span className="text-[9px] px-1 rounded bg-status-blueSoft text-status-blue font-mono">EXTRACTED</span>
          )}
          {doc.parse_status === 'REVIEWED' && (
            <span className="text-[9px] px-1 rounded bg-status-greenSoft text-status-green font-mono">REVIEWED</span>
          )}
        </div>
        <div className="text-[11px] truncate text-muted font-mono">
          {doc.original_filename || doc.id}
        </div>
      </div>

      <div className="relative">
        <button
          onClick={() => !disabled && setPicking(!picking)}
          disabled={disabled}
          className="text-[10px] text-muted hover:text-status-blue px-2 py-1 rounded hover:bg-slate2 disabled:opacity-30"
        >
          change
        </button>
        {picking && (
          <TypePickerMenu
            value={doc.doc_type}
            onPick={(id) => { onTypeChange(doc.id, id); setPicking(false); }}
            onCancel={() => setPicking(false)}
          />
        )}
      </div>
    </div>
  );
}
