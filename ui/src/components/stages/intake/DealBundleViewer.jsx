import React, { Suspense, lazy, useEffect, useState } from 'react';
import { dealPdfUrl, getDealInfo } from '../../../api';
import { PageJumper } from './PageJumper';
import { Mt700TextViewer } from '../parse/Mt700TextViewer';

const PdfViewer = lazy(() =>
  import('../../shared/PdfViewer').then((m) => ({ default: m.PdfViewer }))
);

const blobCache = new Map(); // sessionId -> Blob

/**
 * Right pane — LC text or merged deal-NN.pdf with page jumper.
 */
export function DealBundleViewer({
  sessionId,
  page,
  onPage,
  onNumPages,
  activeDocType,
  isLcActive,
  lcText,
  lcWarnings,
  lcLoading,
}) {
  const [info, setInfo] = useState(null);
  const [blob, setBlob] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    getDealInfo(sessionId)
      .then((d) => { if (!cancelled) setInfo(d); })
      .catch(() => { if (!cancelled) setInfo({ available: false, pageCount: 0 }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !info?.available) {
      setBlob(null);
      setLoadErr(null);
      return;
    }

    const cached = blobCache.get(sessionId);
    if (cached) { setBlob(cached); setLoadErr(null); return; }

    setBlob(null);
    setLoadErr(null);
    let cancelled = false;
    fetch(dealPdfUrl(sessionId))
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? 'Deal PDF not in cache (service may have restarted — re-upload the session).'
              : `HTTP ${res.status}`
          );
        }
        return res.blob();
      })
      .then((b) => {
        if (cancelled) return;
        blobCache.set(sessionId, b);
        setBlob(b);
      })
      .catch((e) => { if (!cancelled) setLoadErr(e.message); });
    return () => { cancelled = true; };
  }, [sessionId, info?.available]);

  const pageCount = info?.pageCount || 0;

  if (isLcActive) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 border border-line rounded-[10px] overflow-hidden bg-white">
        {lcLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted">Loading lc.txt…</div>
        ) : (
          <Mt700TextViewer text={lcText} warnings={lcWarnings} />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate2 text-sm text-muted">
        Loading deal bundle…
      </div>
    );
  }

  if (!info?.available) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate2 gap-2 text-center px-6">
        <div className="text-sm font-semibold text-navy-1">Deal PDF preview</div>
        <div className="text-xs text-muted">
          Available after segmentation splits the merged deal file.
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate2 gap-3 text-center px-6">
        <div className="w-10 h-10 rounded-full bg-status-red/10 flex items-center justify-center text-status-red text-xl">✕</div>
        <div>
          <div className="text-sm font-semibold text-status-red">PDF unavailable</div>
          <div className="text-xs text-muted mt-1">{loadErr}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 border border-line rounded-[10px] overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-line bg-white shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] tracking-[0.18em] uppercase text-muted font-mono">Deal bundle</div>
          <div className="text-[12px] font-semibold text-navy-1 truncate font-mono">
            {info.filename || 'deal.pdf'}
          </div>
        </div>
        <PageJumper page={page} pages={pageCount} onPage={onPage} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-slate2">
        <Suspense fallback={<div className="p-6 text-sm text-muted">Loading viewer…</div>}>
          <PdfViewer
            file={blob}
            page={page}
            onNumPages={onNumPages}
            maxHeightClass="min-h-full"
            docType={activeDocType}
          />
        </Suspense>
      </div>
    </div>
  );
}
