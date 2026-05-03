import React, { useState } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { TypePickerMenu } from '../../shared/TypePickerMenu';
import { DocTypeIcon } from '../../shared/DocTypeIcon';

/** Yellow review-needed tile for UNKNOWN / low-confidence classifications. */
export function ReviewTile({ doc, idx, total, onConfirm, onTypeChange, disabled }) {
  const isUnknown = doc.doc_type === 'UNKNOWN';
  const t = docTypeMeta(isUnknown ? 'INV' : doc.doc_type);
  const [picking, setPicking] = useState(false);

  return (
    <div className={`border-2 border-status-gold rounded-[10px] bg-status-goldSoft relative ${picking ? 'z-30' : 'overflow-hidden'}`}>
      <div className="px-4 py-2 bg-status-goldSoft border-b border-status-gold flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-status-gold text-white text-[11px] font-bold flex items-center justify-center">!</span>
        <span className="text-[11px] font-semibold text-status-gold tracking-tight">
          Confirm document type — {idx} of {total}
        </span>
        <span className="text-[10px] text-status-gold ml-auto font-mono">
          {isUnknown ? 'UNCLASSIFIED' : 'NEEDS CONFIRMATION'}
        </span>
      </div>

      <div className="p-4 flex items-start gap-4">
        <DocTypeIcon type={isUnknown ? 'UNKNOWN' : doc.doc_type} size="lg" pages={doc.page_count} />

        <div className="flex-1 min-w-0">
          <div className="text-[12px] truncate text-navy-1 font-mono">
            {doc.original_filename || doc.id}
          </div>
          <div className="text-[10px] text-muted mt-0.5 font-mono">
            {doc.page_count != null ? `${doc.page_count} pages` : ''}
          </div>

          <div className="mt-3 mb-2 text-[11px] text-navy-1">
            {isUnknown
              ? <>We couldn't classify this from the filename. Please pick the correct type.</>
              : <>We classified this as <b style={{ color: t.color }}>{t.name}</b>. Is that correct?</>
            }
          </div>

          <div className="flex items-center gap-2 flex-wrap relative">
            {!isUnknown && (
              <button
                onClick={() => onConfirm(doc.id)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-[6px] bg-teal-1 text-white text-xs font-medium hover:bg-teal-2 flex items-center gap-1.5 disabled:opacity-30"
              >
                ✓ Yes, confirm as <span className="font-mono uppercase tracking-wider text-[10px]">{t.short}</span>
              </button>
            )}
            <button
              onClick={() => !disabled && setPicking(!picking)}
              disabled={disabled}
              className="px-3 py-1.5 rounded-[6px] bg-white border border-line text-xs hover:bg-slate2 disabled:opacity-30"
            >
              {isUnknown ? 'Pick type…' : 'No, change type…'}
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
      </div>
    </div>
  );
}
