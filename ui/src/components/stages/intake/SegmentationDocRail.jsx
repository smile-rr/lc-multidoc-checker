import React from 'react';
import { docTypeMeta, docSegmentLabel } from '../../../constants/docTypes';
import { formatPageLabel, firstDealPage } from '../../../lib/dealPages';
import { DocTypeIcon } from '../../shared/DocTypeIcon';
import { ReviewTile } from './ReviewTile';

export const LC_RAIL_ID = '__lc__';

/**
 * Left rail for deal-bundle Segmentation — LC on top, then required :46A: with page labels.
 */
export function SegmentationDocRail({
  required,
  docs,
  reviewNeeded,
  selectedDocId,
  lcReady,
  onSelectLc,
  onSelectDoc,
  onConfirm,
  onTypeChange,
}) {
  const items = (required ?? []).filter(r => r.type !== 'LC');
  const have = items.filter(r => r.present).length;
  const lcMeta = docTypeMeta('LC');
  const lcSelected = selectedDocId === LC_RAIL_ID;

  const docForType = (type) =>
    docs.find(d => d.doc_type === type && d.doc_type !== 'UNKNOWN');

  const handleRowClick = (doc) => {
    if (!doc?.deal_tiff_pages?.length) return;
    onSelectDoc?.(doc.id, firstDealPage(doc));
  };

  return (
    <div className="w-80 shrink-0 flex flex-col min-h-0 border border-line rounded-[10px] bg-white overflow-hidden">
      {/* Letter of Credit — always separate at top */}
      <div className="px-4 py-3 border-b border-line shrink-0 bg-slate2/40">
        <div className="text-[10px] tracking-[0.18em] uppercase text-muted font-mono mb-2">
          Letter of Credit
        </div>
        <button
          type="button"
          disabled={!lcReady}
          onClick={() => lcReady && onSelectLc?.()}
          className={`w-full text-left px-2 py-2 flex items-center gap-3 rounded-[8px] transition-colors
            ${lcSelected ? 'bg-teal-1/10 ring-1 ring-teal-1/40' : ''}
            ${lcReady ? 'hover:bg-white cursor-pointer' : 'opacity-70 cursor-default'}`}
        >
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0
            ${lcReady ? 'bg-status-green text-white' : 'bg-slate2 text-muted border border-line'}`}>
            {lcReady ? '✓' : '…'}
          </span>
          <DocTypeIcon type="LC" pages={1} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: lcMeta.color }}>
                {lcMeta.short}
              </span>
              <span className="text-[12px] font-medium text-navy-1 truncate">
                {lcMeta.name}
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono mt-0.5">lc.txt</div>
          </div>
        </button>
      </div>

      <div className="px-4 py-3 border-b border-line shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-muted font-mono">
              Required per LC :46A:
            </div>
            <div className="text-[11px] text-navy-1 mt-0.5">Click a row to preview pages</div>
          </div>
          <div className="text-[10px] text-muted font-mono shrink-0">
            {have}/{items.length}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {reviewNeeded?.length > 0 && (
          <div className="px-3 py-3 border-b border-line bg-status-goldSoft/40">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="w-4 h-4 rounded-full bg-status-gold text-white text-[10px] font-bold flex items-center justify-center">!</span>
              <span className="text-[11px] font-semibold text-status-gold">
                {reviewNeeded.length} need confirmation
              </span>
            </div>
            <div className="space-y-2">
              {reviewNeeded.map((d, i) => (
                <ReviewTile
                  key={d.id}
                  doc={d}
                  idx={i + 1}
                  total={reviewNeeded.length}
                  onConfirm={onConfirm}
                  onTypeChange={onTypeChange}
                />
              ))}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="px-4 py-6 text-[11px] text-muted italic">
            No documents required (or :46A: was empty).
          </div>
        ) : (
          <div className="py-2">
            {items.map((r) => {
              const doc = docForType(r.type);
              const t = docTypeMeta(r.type);
              const pageLabel = doc ? formatPageLabel(doc.deal_tiff_pages) : null;
              const clickable = Boolean(doc?.deal_tiff_pages?.length);
              const selected = doc && selectedDocId === doc.id;
              const statusCls = r.present
                ? 'bg-status-green text-white'
                : 'bg-status-red text-white';

              return (
                <button
                  key={r.type}
                  type="button"
                  disabled={!clickable}
                  onClick={() => doc && handleRowClick(doc)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-line/60 transition-colors
                    ${selected ? 'bg-teal-1/8 border-l-2 border-l-teal-1' : 'border-l-2 border-l-transparent'}
                    ${clickable ? 'hover:bg-slate2 cursor-pointer' : 'opacity-80 cursor-default'}`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${statusCls}`}>
                    {r.present ? '✓' : '!'}
                  </span>
                  {doc ? (
                    <DocTypeIcon type={doc.doc_type} dealTiffPages={doc.deal_tiff_pages} pages={null} />
                  ) : (
                    <span className="w-9 h-9 rounded-[6px] bg-slate2 border border-line flex items-center justify-center text-[14px] shrink-0" style={{ color: t.color }}>
                      {t.icon}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: t.color }}>
                        {t.short}
                      </span>
                      <span className={`text-[12px] font-medium truncate ${r.present ? 'text-navy-1' : 'text-status-red'}`}>
                        {doc ? docSegmentLabel(doc) : (r.label || t.name)}
                      </span>
                    </div>
                    {pageLabel ? (
                      <div className="text-[11px] text-muted font-mono mt-0.5">{pageLabel}</div>
                    ) : (
                      <div className="text-[11px] text-status-red font-mono mt-0.5">Missing</div>
                    )}
                  </div>
                  {r.copies && (
                    <span className="text-[10px] text-muted font-mono shrink-0">{r.copies}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {docs.filter(d =>
          d.doc_type !== 'UNKNOWN'
          && d.deal_tiff_pages?.length
          && !items.some(r => r.type === d.doc_type)
        ).length > 0 && (
          <div className="px-4 py-2 border-t border-line">
            <div className="text-[10px] tracking-[0.18em] uppercase text-muted font-mono mb-2">
              Other segments
            </div>
            {docs
              .filter(d =>
                d.doc_type !== 'UNKNOWN'
                && d.deal_tiff_pages?.length
                && !items.some(r => r.type === d.doc_type)
              )
              .map((doc) => {
                const selected = selectedDocId === doc.id;
                const pageLabel = formatPageLabel(doc.deal_tiff_pages);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleRowClick(doc)}
                    className={`w-full text-left py-2 flex items-center gap-3 rounded-[6px] px-1 transition-colors
                      ${selected ? 'bg-teal-1/8' : 'hover:bg-slate2'}`}
                  >
                    <DocTypeIcon type={doc.doc_type} dealTiffPages={doc.deal_tiff_pages} pages={null} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-navy-1 truncate">{docSegmentLabel(doc)}</div>
                      {pageLabel && <div className="text-[11px] text-muted font-mono">{pageLabel}</div>}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
