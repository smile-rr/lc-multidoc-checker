import { useMemo, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Button from '@shared/ds/Button'
import Chip from '@shared/ds/Chip'
import Icon from '@shared/ds/Icon'
import IconButton from '@shared/ds/IconButton'
import TextArea from '@shared/ds/TextArea'
import PageStrip from '@shared/ds/PageStrip'
import ResizeHandle from '@shared/ds/ResizeHandle'
import { usePageBar } from '@shared/ds/DocumentSurface'
import BundleViewer from './BundleViewer'
import { PANE_FILL } from './paneHeight'
import { useCase } from '../state/CaseContext'

// Manual check — read the credit against a presented document yourself.
//
// The engine's findings are a head start, not the examination. Under UCP 600 art.
// 14(a) the bank examines the documents. So this pane is just the desk: the letter
// of credit on one side, the page on the other, and a place to raise what you see.
// Nothing else — no extracted fields, no requirement cards, no doubt lists. Those
// belong on Interpret and Findings; here they distract from reading.

// **The credit holds the width; the scan takes the rest.**
//
// It was the other way round — the page viewer pinned at 480px and the credit
// flexing — which reads sensibly and is backwards for what the two panes hold. An
// MT700 is narrow, wrapped, fixed-width text: past about 480px it stops gaining
// anything and just runs short lines across a wide column. A scanned page is a
// portrait image whose legibility *is* its width, and it was the one being capped,
// so every pixel a wide window added went to the pane that could not use it.
//
// 460 leaves the longest :45A: line unwrapped and gives the page everything else,
// which on any ordinary window puts the scan slightly ahead of the credit and well
// ahead of it on a large one. Drag still overrides, and double-click comes back here.
const DEFAULT_LEFT = 460

export default function ExaminePane({ onOpenFinding }) {
  const { data, actions } = useCase()
  const presented = useMemo(
    () => data.documents.filter((d) => d.role === 'presented'),
    [data.documents],
  )
  const credit = data.documents.find((d) => d.role === 'credit')

  const [docId, setDocId] = useState(presented[0]?.id ?? null)
  const [page, setPage] = useState(() => presented[0]?.pageRange?.[0] ?? 1)
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT)
  const [draft, setDraft] = useState(() => emptyDraft(presented[0], presented[0]?.pageRange?.[0] ?? 1))
  const { pageBarVisible, togglePageBar } = usePageBar()

  const picked = presented.find((d) => d.id === docId) ?? presented[0]
  // Segmentation is a guess — paging runs the whole bundle, and the tab follows
  // the page rather than trapping you inside one document's range.
  const pageDocId = useMemo(
    () => data.bundlePages.find((p) => p.number === page)?.docId ?? null,
    [data.bundlePages, page],
  )
  const doc = data.documents.find((d) => d.id === pageDocId) ?? picked

  const selectDoc = (id) => {
    setDocId(id)
    const d = presented.find((x) => x.id === id)
    const nextPage = d?.pageRange?.[0] ?? 1
    if (d?.pageRange) setPage(nextPage)
    setDraft(emptyDraft(d, nextPage))
  }

  const goPage = (n) => {
    const next = Math.min(Math.max(1, n), data.totalPages)
    setPage(next)
    const owner = data.bundlePages.find((p) => p.number === next)?.docId
    if (owner && owner !== docId) {
      const owned = presented.find((d) => d.id === owner)
      if (owned) {
        setDocId(owner)
        setDraft((d) => ({
          ...d,
          docId: owner,
          page: next,
          quoteSource: `${owned.docType}, p.${next}`,
        }))
        return
      }
    }
    setDraft((d) => ({
      ...d,
      page: next,
      quoteSource: `${doc?.docType ?? 'Document'}, p.${next}`,
    }))
  }

  if (!credit || !doc) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...PANE_FILL }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {presented.map((d) => {
          const on = d.id === doc.id
          return (
            <button
              key={d.id}
              onClick={() => selectDoc(d.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-20)'}`,
                background: on ? 'var(--me-blue-20)' : '#fff', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: on ? 600 : 400, color: on ? 'var(--me-blue-deep)' : 'var(--me-grey)',
              }}
            >
              {d.docType}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, ...PANE_FILL, minHeight: 0 }}>
        <DocPane
          title="Letter of Credit"
          meta={credit.reference ?? credit.fileName}
          style={{ flex: `0 0 ${leftWidth}px`, width: leftWidth, minWidth: 260 }}
        >
          <div style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.85, color: 'var(--me-ink)' }}>
            {credit.lines?.map((l) => (
              <div key={l.id} style={{ whiteSpace: 'pre-wrap' }}>{l.text}</div>
            ))}
          </div>
        </DocPane>

        <ResizeHandle width={leftWidth} onResize={setLeftWidth} side="left" min={300} max={760} reset={DEFAULT_LEFT} />

        <DocPane
          title={doc.docType}
          meta={doc.reference ?? doc.fileName}
          style={{ flex: 1, minWidth: 320 }}
          toolbar={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconButton icon="chevron-left" size="sm" title="Previous page" onClick={() => goPage(page - 1)} disabled={page <= 1} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', minWidth: 52, textAlign: 'center' }}>{page} / {data.totalPages}</span>
              <IconButton icon="chevron-right" size="sm" title="Next page" onClick={() => goPage(page + 1)} disabled={page >= data.totalPages} />
              <IconButton icon={pageBarVisible ? 'rows-3' : 'rows-2'} size="sm" title={pageBarVisible ? 'Hide the page row' : 'Show every page'} onClick={togglePageBar} />
            </span>
          )}
          pageBar={pageBarVisible ? (
            <PageStrip pages={data.totalPages} activePage={page} onPage={goPage} docLabel={doc.docType} />
          ) : null}
        >
          <div style={{ height: '100%', background: 'var(--me-grey-08)' }}>
            <BundleViewer pdfUrl={data.pdfUrl} page={page} onPageChange={goPage} />
          </div>
        </DocPane>
      </div>

      <RaisePanel
        draft={draft}
        setDraft={setDraft}
        onRaise={(d) => {
          const f = actions.raiseFinding(d)
          setDraft(emptyDraft(doc, page))
          onOpenFinding?.(f.id)
        }}
      />
    </div>
  )
}

function emptyDraft(doc, page) {
  return {
    text: '',
    outcome: 'DISCREPANT',
    docId: doc?.id ?? null,
    page: page ?? null,
    quote: '',
    quoteSource: doc ? `${doc.docType}${page ? `, p.${page}` : ''}` : '',
  }
}

function DocPane({ title, meta, toolbar, pageBar, style, children }) {
  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>{title}</span>
        {meta ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{meta}</span> : null}
        <div style={{ flex: 1 }} />
        {toolbar}
      </div>
      {pageBar ? (
        <div style={{ borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
          {pageBar}
        </div>
      ) : null}
      <div style={{ ...PANE_FILL, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

// One box under the two pages. First line is the headline; severity defaults to
// To decide — a wrongly-raised discrepancy goes into a refusal notice and has to
// be defended, a query raised too cautiously can be looked at again.
function RaisePanel({ draft, setDraft, onRaise }) {
  const text = draft.text ?? ''
  const firstLine = text.split('\n')[0].trim()
  const ready = firstLine.length > 2
  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', borderColor: 'var(--me-grey-15)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--me-grey-15)' }}>
        <Icon name="flag" size={13} color="var(--me-blue-deep)" />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--me-ink)' }}>
          Raise a finding
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>
          on {draft.quoteSource || 'this document'}
        </span>
      </div>
      <div style={{ padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TextArea
          value={text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder={'What is wrong.\nAnything more for the record.'}
          maxLines={8}
          maxLength={900}
          style={{ width: '100%', minHeight: 52, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none' }}
        />
        {/* The two an officer may write, and the same two the override control
            offers on a finding — never DOUBT. A person raising something has already
            formed the view; recording their own uncertainty as the engine's
            inability to conclude would put a question on the file that nobody
            actually has. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {[
            { id: 'DISCREPANT', label: 'Discrepant' },
            { id: 'CLEAN', label: 'Clean' },
          ].map((o) => (
            <Chip key={o.id} size="md" tone={draft.outcome === o.id ? 'blue' : 'plain'} onClick={() => setDraft({ ...draft, outcome: o.id })}>
              {draft.outcome === o.id ? <Icon name="check" size={11} /> : null}
              {o.label}
            </Chip>
          ))}
          <div style={{ flex: 1 }} />
          <Button
            variant="primary"
            size="sm"
            onClick={() => onRaise({ ...draft, title: firstLine, detail: text.slice(firstLine.length).trim() })}
            disabled={!ready}
          >
            Raise
          </Button>
        </div>
      </div>
    </div>
  )
}
