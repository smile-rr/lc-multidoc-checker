import { Suspense, lazy } from 'react'

// Code-split: react-pdf + the pdfjs worker are ~500 KB, and only the Interpret stage
// needs them. Same reasoning as ui/src/components/stages/parse/ParseViewer.jsx.
const PdfViewer = lazy(() => import('@shared/ds/PdfViewer'))

/**
 * The presentation bundle, scrolled continuously.
 *
 * One PDF holds every presented document, so `page` is a bundle page: selecting a
 * document in the rail scrolls to where that document starts, and scrolling on
 * past its last page is how an officer checks a segmentation boundary.
 * `onPageChange` reports the page in view so the rail and page strip follow.
 *
 * The URL is stable across page changes, so react-pdf keeps the parsed document.
 */
export default function BundleViewer({ pdfUrl, page, onPageChange }) {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: 'var(--me-grey-70)' }}>Loading viewer…</div>}>
      <PdfViewer src={pdfUrl} page={page} onPageChange={onPageChange} />
    </Suspense>
  )
}
