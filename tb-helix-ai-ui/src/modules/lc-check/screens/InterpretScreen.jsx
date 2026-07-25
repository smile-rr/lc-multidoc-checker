import { useState, useMemo } from 'react'
import PageStrip from '@shared/ds/PageStrip'
import ResizeHandle from '@shared/ds/ResizeHandle'
import DocumentSurface, { DOC_VIEWPORT_HEIGHT, usePageBar } from '@shared/ds/DocumentSurface'
import Icon from '@shared/ds/Icon'
import { pageRange } from '@shared/lib/format'
import DocRail from '../components/DocRail'
import BundleViewer from '../components/BundleViewer'
import Mt700TextViewer from '../components/Mt700TextViewer'
import FactsPanel from '../components/FactsPanel'
import { useCase } from '../state/CaseContext'

// Stage 2 — what we made of it.
//
// Rail │ source │ extraction, following the v3 examination UI's parse stage, with
// a draggable divider because officers size the fields panel to their screen.
//
// Source and extraction sit side by side because this stage is a claim, not a
// transcript: every fact on the right is something we decided the document says,
// and the page that produced it is one glance away for the disagreeing.
//
// The middle pane swaps by document kind, and so does what provenance means:
//   · the credit is text  → tag viewer; hovering a fact highlights its line
//   · a presented doc is a scan → PDF; selecting a fact turns to its page
export default function InterpretScreen() {
  const { data, run } = useCase()

  const [selectedId, setSelectedId] = useState('mt700')
  const [hoverAnchor, setHoverAnchor] = useState(null)
  const [page, setPage] = useState(1)
  const [panelWidth, setPanelWidth] = useState(460)
  const { pageBarVisible, togglePageBar } = usePageBar()

  const selected = data.documents.find((d) => d.id === selectedId) ?? data.documents[0]
  const isCredit = selected.role === 'credit'

  // Which document the page on screen belongs to. Paging past a segmentation
  // boundary moves the rail with it, rather than leaving the two disagreeing.
  const pageDoc = useMemo(
    () => data.bundlePages.find((p) => p.number === page)?.docId ?? null,
    [data.bundlePages, page],
  )
  const shownDoc = isCredit ? selected : data.documents.find((d) => d.id === pageDoc) ?? selected

  const facts = data.facts.filter((f) => f.docId === shownDoc.id)

  const selectDoc = (id) => {
    setSelectedId(id)
    setHoverAnchor(null)
    const first = data.bundlePages.find((p) => p.docId === id)
    if (first) setPage(first.number)
  }

  const onPickFact = (fact) => {
    if (fact.page) setPage(fact.page)
  }

  return (
    <section className="helix-screen" style={{ padding: '16px 24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, height: DOC_VIEWPORT_HEIGHT }}>
        <div style={{ width: 240, flex: '0 0 240px', overflow: 'auto' }}>
          <DocRail
            documents={data.documents}
            selectedId={shownDoc.id}
            onSelect={selectDoc}
            segmented={run.segmented}
            segmentTotal={run.segmentTotal}
            segmentNote={run.started ? 'Finding where each document starts and ends…' : 'The presentation is split when the review runs.'}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <DocumentSurface
            pageBarVisible={pageBarVisible}
            onTogglePageBar={togglePageBar}
            header={
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shownDoc.docType}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
                  {isCredit ? shownDoc.fileName : `${shownDoc.fileName} · ${pageRange(shownDoc.pageRange)}`}
                </span>
                {shownDoc.lowConfidence ? (
                  <span title="Part of this document was hard to read" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#946400', whiteSpace: 'nowrap' }}>
                    <Icon name="alert-triangle" size={13} color="var(--status-warning)" />
                    Hard to read
                  </span>
                ) : null}
              </>
            }
            notice={shownDoc.scanNote}
            toolbar={
              isCredit ? null : (
                <PageStrip
                  pages={data.totalPages}
                  activePage={page}
                  onPage={setPage}
                  docPages={shownDoc.pages ?? []}
                  docLabel={shownDoc.docType.toLowerCase()}
                />
              )
            }
          >
            {isCredit ? (
              <Mt700TextViewer
                lines={selected.lines}
                highlightId={hoverAnchor}
                onHoverLine={setHoverAnchor}
                fileName={selected.fileName}
              />
            ) : (
              <BundleViewer pdfUrl={data.pdfUrl} page={page} onPageChange={setPage} />
            )}
          </DocumentSurface>
        </div>

        <ResizeHandle width={panelWidth} onResize={setPanelWidth} min={320} max={720} />

        <div style={{ width: panelWidth, flex: `0 0 ${panelWidth}px`, minHeight: 0 }}>
          <FactsPanel
            title={isCredit ? 'letter of credit' : shownDoc.docType}
            meta={isCredit ? 'parsed by SWIFT tag' : `read from ${pageRange(shownDoc.pageRange)}`}
            facts={facts}
            hoverAnchor={hoverAnchor}
            onHoverAnchor={setHoverAnchor}
            activePage={isCredit ? null : page}
            onPickFact={onPickFact}
          />
        </div>
      </div>
    </section>
  )
}
