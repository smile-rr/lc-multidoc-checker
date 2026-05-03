import React from 'react';
import { PdfViewer } from '../../shared/PdfViewer';
import { pdfUrl } from '../../../api';

/**
 * Wraps the shared PdfViewer for non-LC docs; falls back to a plain raw-text
 * preview for LC (MT700 is text, not a PDF).
 *
 * The Parse stage's center pane uses this; the LC text comes from the session's
 * lcText field but we don't have it directly here — show a placeholder with
 * a stub. Future: GET /sessions/{id}/lc-text endpoint.
 */
export function ParseViewer({ sessionId, doc, page, onNumPages }) {
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
  return (
    <PdfViewer
      src={pdfUrl(sessionId, doc.id)}
      page={page}
      onNumPages={onNumPages}
      maxHeightClass="h-full"
      docType={doc.doc_type}
      originalFilename={doc.original_filename}
    />
  );
}
