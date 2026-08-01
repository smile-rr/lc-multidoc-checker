import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  useFitWidth,
  useZoom,
  ViewerToolbar,
  ViewerScroll,
  PageColumn,
  PageSkeleton,
  PageJump,
  TOOLBAR_HEIGHT,
} from './viewerChrome'

// Ported from the v3 examination UI (`ui/src/components/shared/PdfViewer.jsx`),
// restyled onto the Memara tokens and changed in two ways that matter.
//
// One: the worker is bundled by Vite rather than fetched from unpkg, so the
// version can never drift from the pdfjs-dist we resolve and the workbench works
// with no internet. If this is ever served behind a proxy that rewrites .mjs,
// revisit this line, not the component.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Two: pages render continuously in one scroll container rather than one at a
// time. Reading a presentation means moving through it — a checker comparing the
// foot of one page with the head of the next should scroll, not hunt for a
// button. `page` becomes a scroll target rather than a filter, and scrolling
// reports back which page is in view so the page strip stays truthful.
//
// The frame (fit width, zoom bar, page captions) comes from viewerChrome, shared
// with the text viewer so the two are indistinguishable as containers.

/**
 * @param {object} props
 * @param {string} [props.src] URL to load.
 * @param {Blob}   [props.file] Or a blob, if the caller fetched it.
 * @param {number} [props.page] Page to bring into view. Changing it scrolls.
 * @param {(page:number)=>void} [props.onPageChange] Fired as the user scrolls.
 * @param {(n:number)=>void} [props.onNumPages]
 */
export default function PdfViewer({ src, file, page, onPageChange, onNumPages, height = '100%' }) {
  const [numPages, setNumPages] = useState(0)
  const [err, setErr] = useState(null)
  const [progress, setProgress] = useState(null)

  const scrollRef = useRef(null)
  const pageRefs = useRef(new Map())
  const fitWidth = useFitWidth(scrollRef)
  const { zoom, zoomIn, zoomOut, reset } = useZoom()
  const pageWidth = Math.round(fitWidth * zoom)

  // True while we are scrolling on the caller's behalf. Without this, our own
  // scroll fires onPageChange, the caller sets `page`, and we scroll again —
  // the classic controlled-scroll feedback loop.
  //
  // `scrollTarget` is the page we are going to. The flag stays up until that
  // page is the one in view (or a safety timeout). A fixed short timeout was
  // not enough for smooth scroll across several pages: the observer would
  // report an intermediate page, the rail jumped to the wrong document, and a
  // second click was needed to land.
  const programmatic = useRef(false)
  const scrollTarget = useRef(null)
  const visiblePage = useRef(page ?? 1)
  const releaseTimer = useRef(0)

  const releaseProgrammatic = useCallback(() => {
    programmatic.current = false
    scrollTarget.current = null
    if (releaseTimer.current) {
      window.clearTimeout(releaseTimer.current)
      releaseTimer.current = 0
    }
  }, [])

  // Land with the page's top edge just below the toolbar, so reading starts at the
  // top of the page and continues downward — the way you read a document.
  //
  // Measured from the two rects rather than `offsetTop`: offsetTop is relative to
  // whichever ancestor happens to be positioned, which here is not the scroller,
  // so it was landing mid-page.
  const scrollToPage = useCallback((n) => {
    const el = pageRefs.current.get(n)
    const scroller = scrollRef.current
    if (!el || !scroller) return
    programmatic.current = true
    scrollTarget.current = n
    visiblePage.current = n
    if (releaseTimer.current) window.clearTimeout(releaseTimer.current)
    const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    const top = scroller.scrollTop + delta - TOOLBAR_HEIGHT - 8
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    // Safety only — arrival is cleared by the observer when the target is in view.
    releaseTimer.current = window.setTimeout(releaseProgrammatic, 1500)
  }, [releaseProgrammatic])

  // Caller asked for a page — go there, unless it is already the page in view.
  useEffect(() => {
    if (!page || !numPages) return
    if (page === visiblePage.current && !programmatic.current) return
    if (programmatic.current && scrollTarget.current === page) return
    scrollToPage(page)
  }, [page, numPages, zoom, scrollToPage])

  // Report the page occupying most of the viewport as the user scrolls.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !numPages || typeof IntersectionObserver === 'undefined') return undefined

    const ratios = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(Number(e.target.dataset.pageNumber), e.intersectionRatio))
        let best = visiblePage.current
        let bestRatio = 0
        ratios.forEach((r, n) => { if (r > bestRatio) { bestRatio = r; best = n } })
        if (best === visiblePage.current) return
        visiblePage.current = best
        // Still travelling to a rail/strip click — ignore intermediate pages so
        // the document list does not flash the one at the top of the bundle.
        if (programmatic.current) {
          if (best === scrollTarget.current) {
            releaseProgrammatic()
            onPageChange?.(best)
          }
          return
        }
        onPageChange?.(best)
      },
      { root: scroller, rootMargin: `-${TOOLBAR_HEIGHT}px 0px -55% 0px`, threshold: [0, 0.01, 0.5, 1] },
    )

    pageRefs.current.forEach((el) => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [numPages, onPageChange, pageWidth, releaseProgrammatic])

  useEffect(() => () => {
    if (releaseTimer.current) window.clearTimeout(releaseTimer.current)
  }, [])

  if (err) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-error)' }}>PDF unavailable</span>
        <span style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{err}</span>
      </div>
    )
  }
  if (!(file ?? src)) {
    return <div style={{ padding: 16, fontSize: 13, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>No PDF source provided.</div>
  }

  return (
    <ViewerScroll scrollRef={scrollRef} height={height}>
      <ViewerToolbar
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        reset={reset}
        left={numPages > 1 ? <PageJump page={page ?? visiblePage.current} total={numPages} onGo={scrollToPage} /> : null}
        right={numPages > 0 ? 'scroll to read on' : ''}
      />

      <Document
        file={file ?? src}
        onLoadSuccess={(d) => { setNumPages(d.numPages); onNumPages?.(d.numPages); setProgress(null) }}
        onLoadError={(e) => setErr(e.message)}
        onLoadProgress={({ loaded, total }) => setProgress({ loaded, total })}
        loading={<DocumentSkeleton width={pageWidth} progress={progress} />}
      >
        <PageColumn>
          {Array.from({ length: numPages }, (_, i) => {
            const n = i + 1
            return (
              <div
                key={n}
                data-page-number={n}
                ref={(el) => {
                  if (el) pageRefs.current.set(n, el)
                  else pageRefs.current.delete(n)
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
              >
                <Page pageNumber={n} width={pageWidth} renderTextLayer={false} loading={<PageSkeleton width={pageWidth} />} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-50)' }}>
                  page {n} of {numPages}
                </span>
              </div>
            )
          })}
        </PageColumn>
      </Document>
    </ViewerScroll>
  )
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function DocumentSkeleton({ width, progress }) {
  const pct = progress?.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null
  return (
    <PageColumn>
      <PageSkeleton width={width} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        <span>Loading PDF…</span>
        {progress?.total ? (
          <>
            <span style={{ width: 128, height: 5, background: 'var(--me-grey-15)', borderRadius: 999, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', background: 'var(--me-blue)', width: `${pct}%`, transition: 'width 160ms var(--ease-standard)' }} />
            </span>
            <span>{fmtBytes(progress.loaded)} / {fmtBytes(progress.total)}</span>
          </>
        ) : progress?.loaded ? (
          <span>{fmtBytes(progress.loaded)}</span>
        ) : null}
      </div>
    </PageColumn>
  )
}
