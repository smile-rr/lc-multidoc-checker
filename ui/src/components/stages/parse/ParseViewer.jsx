import React, { useEffect, useState } from 'react';
import { PdfViewer } from '../../shared/PdfViewer';

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
    setBlob(null);
    setLoadErr(null);

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
      .then((b) => setBlob(b))
      .catch((e) => setLoadErr(e.message));
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
    <PdfViewer
      file={blob}
      page={page}
      onNumPages={onNumPages}
      maxHeightClass="h-full"
      docType={doc.doc_type}
    />
  );
}
