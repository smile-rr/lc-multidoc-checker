import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { docTypeMeta } from '../../constants/docTypes';

// Worker served from unpkg CDN (matches v1). Avoids bundling pdf.worker.min.mjs
// into our dist, which means no nginx .mjs MIME rule is needed and no Traefik
// middleware can gate the worker by path.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE_WIDTH = 560;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

/**
 * Multi-page PDF viewer with a slim zoom toolbar.
 *
 * Pass `src` (a URL) to load the PDF. The container is overflow-auto on both
 * axes so when zoom pushes a page wider/taller than the viewport the user gets
 * natural scroll-as-pan. Toolbar is sticky inside the scroll container.
 */
export function PdfViewer({ src, file, page, onNumPages, maxHeightClass = 'h-full', docType }) {
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [err, setErr] = useState(null);
  const [progress, setProgress] = useState(null); // { loaded, total } | null

  const docFile = file ?? src ?? null;

  const dec = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const inc = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const reset = () => setZoom(1.0);

  if (err) {
    return <div className="p-4 text-sm text-status-red">PDF load failed: {err}</div>;
  }
  if (!docFile) {
    return <div className="p-4 text-sm text-muted italic">No PDF source provided.</div>;
  }

  return (
    <div className={`bg-paper rounded-[10px] border border-line overflow-auto ${maxHeightClass}`}>
      {docType && (
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-line px-3 py-1.5 flex items-center gap-2 text-xs min-h-[30px]">
          <span className="text-[13px]" style={{ color: docTypeMeta(docType).color }}>
            {docTypeMeta(docType).icon}
          </span>
          <span className="font-semibold text-navy-1 text-[12px]">
            {docTypeMeta(docType).name}
          </span>
          <span className="font-mono text-[10px] text-muted">
            ({docTypeMeta(docType).short})
          </span>
        </div>
      )}
      <div className="sticky top-[30px] z-10 bg-slate2/95 backdrop-blur border-b border-line px-3 py-1.5 flex items-center gap-1 text-xs">
        <ToolBtn onClick={dec} disabled={zoom <= ZOOM_MIN} label="Zoom out">−</ToolBtn>
        <span className="font-mono w-12 text-center select-none">{Math.round(zoom * 100)}%</span>
        <ToolBtn onClick={inc} disabled={zoom >= ZOOM_MAX} label="Zoom in">+</ToolBtn>
        <span className="w-px h-4 bg-line mx-1.5" />
        <ToolBtn onClick={reset} disabled={zoom === 1.0} label="Reset zoom">
          <span className="font-mono text-[11px]">100%</span>
        </ToolBtn>
        <div className="ml-auto font-mono text-[10px] text-muted">
          {numPages > 0 ? `${numPages} page${numPages === 1 ? '' : 's'}` : ''}
        </div>
      </div>

      <Document
        file={docFile}
        onLoadSuccess={(d) => { setNumPages(d.numPages); onNumPages?.(d.numPages); setProgress(null); }}
        onLoadError={(e) => setErr(e.message)}
        onLoadProgress={({ loaded, total }) => setProgress({ loaded, total })}
        loading={<DocumentSkeleton zoom={zoom} progress={progress} />}
      >
        <div className="py-4 flex flex-col items-center gap-4">
          {page
            ? <Page pageNumber={page} width={BASE_WIDTH * zoom} renderTextLayer={false}
                    loading={<PageSkeleton width={BASE_WIDTH * zoom} />} />
            : Array.from({ length: numPages }, (_, i) => (
                <Page key={i} pageNumber={i + 1} width={BASE_WIDTH * zoom} renderTextLayer={false}
                      loading={<PageSkeleton width={BASE_WIDTH * zoom} />} />
              ))
          }
        </div>
      </Document>
    </div>
  );
}

function fmtKB(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function PageSkeleton({ width }) {
  // 8.5 × 11 letter ratio fallback; close enough for skeleton placeholder.
  const height = Math.round(width * 1.294);
  return (
    <div
      className="bg-slate2/60 border border-line rounded animate-pulse"
      style={{ width, height }}
      aria-label="Loading page"
    />
  );
}

function DocumentSkeleton({ zoom, progress }) {
  const width = BASE_WIDTH * zoom;
  const pct = progress?.total
    ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
    : null;
  return (
    <div className="py-4 flex flex-col items-center gap-3">
      <PageSkeleton width={width} />
      <div className="text-xs text-muted font-mono flex items-center gap-2">
        <span>Loading PDF…</span>
        {progress?.total ? (
          <>
            <span className="w-32 h-1.5 bg-slate2 rounded overflow-hidden">
              <span className="block h-full bg-navy-1/60 transition-all" style={{ width: `${pct}%` }} />
            </span>
            <span>{fmtKB(progress.loaded)} / {fmtKB(progress.total)}</span>
          </>
        ) : progress?.loaded ? (
          <span>{fmtKB(progress.loaded)}</span>
        ) : null}
      </div>
    </div>
  );
}

function ToolBtn({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="px-1.5 h-6 min-w-6 rounded border border-line text-navy-1 hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
    >
      {children}
    </button>
  );
}
