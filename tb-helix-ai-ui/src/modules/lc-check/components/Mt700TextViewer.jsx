import { useRef } from 'react'
import { PROVENANCE_HIGHLIGHT } from '@shared/lib/tone'
import {
  useFitWidth,
  useZoom,
  ViewerToolbar,
  ViewerScroll,
  PageColumn,
  PageSheet,
} from '@shared/ds/viewerChrome'

// The credit, as the message that arrived — one row per SWIFT tag, original text
// preserved.
//
// Built on the same chrome as the PDF viewer: same scroll container, same zoom
// bar, same page sheet fitted to the pane, same caption underneath. It used to be
// a fixed 620px card centred in grey space, which read as an overlay floating
// above the app rather than a document sitting in a viewer — and it changed width
// when you switched to a scan.
//
// Zoom scales the type rather than the sheet: this is text, so magnifying it
// should reflow within the page, not enlarge a bitmap.
//
// Because this is text and not a scan, provenance here is exact: a fact in the
// panel beside it lights up the precise line it was read from.
export default function Mt700TextViewer({ lines, highlightId, onHoverLine, fileName }) {
  const scrollRef = useRef(null)
  const fitWidth = useFitWidth(scrollRef)
  const { zoom, zoomIn, zoomOut, reset } = useZoom()

  const tagCount = lines.filter((l) => l.tag).length

  return (
    <ViewerScroll scrollRef={scrollRef}>
      <ViewerToolbar
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        reset={reset}
        right={`text · ${tagCount} field${tagCount === 1 ? '' : 's'}`}
      />

      <PageColumn>
        <PageSheet width={fitWidth} caption="page 1 of 1">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 * zoom, lineHeight: 1.9, color: 'var(--me-ink)', flex: 1 }}>
            {lines.map((line) => {
              const on = highlightId && line.id === highlightId
              const isTag = !!line.tag
              return (
                <div
                  key={line.id}
                  onMouseEnter={isTag && onHoverLine ? () => onHoverLine(line.id) : undefined}
                  onMouseLeave={isTag && onHoverLine ? () => onHoverLine(null) : undefined}
                  title={line.label || undefined}
                  style={{
                    padding: '1px 5px',
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    color: isTag ? 'var(--me-ink)' : 'var(--me-grey-50)',
                    background: on ? PROVENANCE_HIGHLIGHT.bg : 'transparent',
                    boxShadow: on ? PROVENANCE_HIGHLIGHT.ring : 'none',
                    transition: 'background 140ms var(--ease-standard)',
                  }}
                >
                  {line.text}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--me-grey-08)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-50)', textAlign: 'right' }}>
            {fileName}
          </div>
        </PageSheet>
      </PageColumn>
    </ViewerScroll>
  )
}
