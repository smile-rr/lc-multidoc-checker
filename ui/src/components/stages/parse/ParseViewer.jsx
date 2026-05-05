import React, { Suspense, lazy, useEffect, useState } from 'react';

// Code-split the PDF viewer (react-pdf + pdfjs-dist worker bundle ~500 KB)
// so HomePage and other stages don't pay for it.
const PdfViewer = lazy(() =>
  import('../../shared/PdfViewer').then((m) => ({ default: m.PdfViewer }))
);

// Module-level cache so flipping between docs in the Parse stage doesn't
// re-fetch the bytes. Browser HTTP cache covers cross-session, but this
// also avoids the blob() decode roundtrip on every switch.
const blobCache = new Map(); // docId -> Blob

/**
 * Wraps the shared PdfViewer for non-LC docs; falls back to a plain raw-text
 * preview for LC (MT700 is text, not a PDF).
 *
 * Fetches the PDF blob ourselves so we can surface a meaningful 404 message
 * when the in-process cache has expired (e.g. after JVM restart).
 */
export function ParseViewer({ sessionId, doc, page, onNumPages }) {
  const [blob, setBlob] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (!doc || doc.doc_type === 'LC') return;
    setLoadErr(null);

    const cached = blobCache.get(doc.id);
    if (cached) { setBlob(cached); return; }

    setBlob(null);
    let cancelled = false;
    const url = `/api/v2/sessions/${sessionId}/documents/${doc.id}/pdf`;
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? 'PDF not in cache (service may have restarted — re-upload the session).'
              : `HTTP ${res.status}`
          );
        }
        return res.blob();
      })
      .then((b) => {
        if (cancelled) return;
        blobCache.set(doc.id, b);
        setBlob(b);
      })
      .catch((e) => { if (!cancelled) setLoadErr(e.message); });
    return () => { cancelled = true; };
  }, [sessionId, doc?.id, doc?.doc_type]);

  if (!doc) {
    return <div className="p-4 text-sm text-muted italic">Select a document.</div>;
  }

  if (doc.doc_type === 'LC') {
    return (
      <div className="bg-white p-4 h-full overflow-auto">
        <pre className="text-[11px] leading-[1.55] font-mono whitespace-pre-wrap">
{`MT700 Letter of Credit (raw text preview is not yet streamed by the v2 backend).

Filename: ${doc.original_filename || doc.id}
Pages:    ${doc.page_count ?? 1}

Use the Fields panel on the right to inspect parsed values.`}
        </pre>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="w-10 h-10 rounded-full bg-status-red/10 flex items-center justify-center text-status-red text-xl">✕</div>
        <div>
          <div className="text-sm font-semibold text-status-red">PDF unavailable</div>
          <div className="text-xs text-muted mt-1">{loadErr}</div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading viewer…</div>}>
      <PdfViewer
        file={blob}
        page={page}
        onNumPages={onNumPages}
        maxHeightClass="h-full"
        docType={doc.doc_type}
      />
    </Suspense>
  );
}
