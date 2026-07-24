import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Mt700TextViewer } from '../stages/parse/Mt700TextViewer';
import { PageJumper } from '../stages/intake/PageJumper';

const PdfViewer = lazy(() =>
  import('../shared/PdfViewer').then((m) => ({ default: m.PdfViewer }))
);

/**
 * Right pane — local File preview before upload (text or PDF).
 */
export function UploadLocalPreview({ file, kind, onClose }) {
  const [text, setText] = useState(null);
  const [textErr, setTextErr] = useState(null);
  const [blob, setBlob] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    setPage(1);
    setPages(0);
    setText(null);
    setTextErr(null);
    if (!file) return undefined;

    if (kind === 'text') {
      file.text()
        .then(setText)
        .catch((e) => setTextErr(e.message || 'Failed to read file'));
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setBlob(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 border border-line rounded-[10px] overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-line bg-white shrink-0">
        <span className="text-[11px] font-mono text-navy-1 truncate flex-1 min-w-0">
          {file?.name}
        </span>
        {kind === 'pdf' && pages > 1 && (
          <PageJumper page={page} pages={pages} onPage={setPage} />
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 shrink-0 rounded flex items-center justify-center text-[16px] leading-none text-muted hover:text-navy-1 hover:bg-slate2"
          aria-label="Close preview"
          title="Close preview (Esc)"
        >
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-slate2">
        {kind === 'text' && textErr && (
          <div className="p-4 text-sm text-status-red">{textErr}</div>
        )}
        {kind === 'text' && !textErr && text == null && (
          <div className="p-6 text-sm text-muted">Loading…</div>
        )}
        {kind === 'text' && text != null && (
          <Mt700TextViewer text={text} warnings={[]} />
        )}
        {kind === 'pdf' && (
          <Suspense fallback={<div className="p-6 text-sm text-muted">Loading viewer…</div>}>
            <PdfViewer
              file={blob}
              page={page}
              onNumPages={setPages}
              maxHeightClass="min-h-full"
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
