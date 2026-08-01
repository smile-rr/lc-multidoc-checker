import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Button from '@shared/ds/Button'
import FloatingPanel from '@shared/ds/FloatingPanel'
import IconButton from '@shared/ds/IconButton'
import TextArea from '@shared/ds/TextArea'
import PageStrip from '@shared/ds/PageStrip'
import ResizeHandle from '@shared/ds/ResizeHandle'
import { usePageBar } from '@shared/ds/DocumentSurface'
import BundleViewer from './BundleViewer'
import OutcomeSelect from './OutcomeSelect'
import { PANE_FILL } from './paneHeight'
import { useCase } from '../state/CaseContext'

// Manual check — read the credit against a presented document yourself.
//
// The engine's findings are a head start, not the examination. Under UCP 600 art.
// 14(a) the bank examines the documents. So this pane is just the desk: the letter
// of credit on one side, the page on the other. "Raise a finding" sits in the
// toolbar under Manual Check — a real button, not a floating icon. The form is
// the only overlay: first open drops under that button; drag it away if it covers
// what you are reading. Nothing else here: no extracted fields, no requirement
// cards, no doubt lists. Those belong on Interpret and Findings; here they distract
// from reading.

const RAISE_PANEL_W = 440

// **Down the middle, and it stays down the middle.**
//
// The split is a *share* of the pane rather than a pixel width on one side. Both
// earlier versions pinned one pane and let the other flex — the scan at 480, then the
// credit at 460 — and either way the halves were only equal at one window size: every
// pixel a wider window added went to whichever side was flexing. A ratio is the only
// thing that reads as "half and half" on a laptop and on a 32-inch screen both.
//
// Dragging moves the ratio, not a width, so a split set on one screen survives being
// opened on another. Double-clicking the divider comes back to the middle.
const DEFAULT_SPLIT = 0.5

// Below this the two panes stop being a comparison and become two slivers; the ratio
// is clamped rather than the panes allowed to collapse.
const MIN_SHARE = 0.25

export default function ExaminePane({ onOpenFinding }) {
  const { data, actions } = useCase()
  const presented = useMemo(
    () => data.documents.filter((d) => d.role === 'presented'),
    [data.documents],
  )
  const credit = data.documents.find((d) => d.role === 'credit')

  const [docId, setDocId] = useState(presented[0]?.id ?? null)
  const [page, setPage] = useState(() => presented[0]?.pageRange?.[0] ?? 1)
  // The credit's share of the row. The scan gets the remainder.
  const [split, setSplit] = useState(DEFAULT_SPLIT)
  // Measured, because the handle drags in pixels and the layout is a ratio — this is
  // the one place the two have to meet.
  const splitRef = useRef(null)
  const [rowWidth, setRowWidth] = useState(0)
  const [draft, setDraft] = useState(() => emptyDraft(presented[0], presented[0]?.pageRange?.[0] ?? 1))
  // Closed by default — the desk is for reading. The toolbar button opens the form.
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAnchor, setRaiseAnchor] = useState(null)
  const raiseBtnRef = useRef(null)
  const { pageBarVisible, togglePageBar } = usePageBar()

  useLayoutEffect(() => {
    const measure = () => setRowWidth(splitRef.current?.offsetWidth ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

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

  const toggleRaise = () => {
    if (raiseOpen) {
      setRaiseOpen(false)
      return
    }
    // First open (and any open before the panel has been dragged) sits under the
    // button. After a drag, FloatingPanel remembers and ignores this.
    const r = raiseBtnRef.current?.getBoundingClientRect()
    if (r) setRaiseAnchor({ left: r.left, top: r.bottom + 8 })
    setRaiseOpen(true)
  }

  if (!credit || !doc) return null

  const draftPending = Boolean(draft.text?.trim())

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
        <div style={{ flex: 1, minWidth: 8 }} />
        {/* Secondary on purpose. The workbench header already owns the one primary
            on this screen ("Open the decision"); a second blue pill under Manual
            Check reads as a rival next step rather than a tool inside this mode. */}
        <span ref={raiseBtnRef} style={{ display: 'inline-flex' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleRaise}
          >
            {draftPending && !raiseOpen ? 'Continue draft' : 'Raise a finding'}
          </Button>
        </span>
      </div>

      <div ref={splitRef} style={{ display: 'flex', alignItems: 'stretch', gap: 0, ...PANE_FILL, minHeight: 0 }}>
        <DocPane
          title="Letter of Credit"
          meta={credit.reference ?? credit.fileName}
          style={{ flex: `${split} 1 0`, minWidth: 0 }}
        >
          <div style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.85, color: 'var(--me-ink)' }}>
            {credit.lines?.map((l) => (
              <div key={l.id} style={{ whiteSpace: 'pre-wrap' }}>{l.text}</div>
            ))}
          </div>
        </DocPane>

        <ResizeHandle
          width={Math.round(split * rowWidth)}
          onResize={(px) => setSplit(clamp(rowWidth ? px / rowWidth : DEFAULT_SPLIT))}
          side="left"
          min={0}
          max={rowWidth || 4000}
          reset={Math.round(DEFAULT_SPLIT * rowWidth)}
        />

        <DocPane
          title={doc.docType}
          meta={doc.reference ?? doc.fileName}
          style={{ flex: `${1 - split} 1 0`, minWidth: 0 }}
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

      <FloatingPanel
        id="lc-check-raise-finding"
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title="Raise a finding"
        status={raiseStatus(draft)}
        width={RAISE_PANEL_W}
        height={220}
        anchor={raiseAnchor}
      >
        <RaisePanel
          draft={draft}
          setDraft={setDraft}
          onRaise={(d) => {
            const f = actions.raiseFinding(d)
            setDraft(emptyDraft(doc, page))
            setRaiseOpen(false)
            onOpenFinding?.(f.id)
          }}
        />
      </FloatingPanel>
    </div>
  )
}

function raiseStatus(draft) {
  const source = draft.quoteSource || 'this document'
  const first = (draft.text ?? '').split('\n')[0].trim()
  return first ? `${source} · ${first}` : `on ${source}`
}

const clamp = (share) => Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, share))

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

// Body of the floating raise window. The window chrome (title, minimise, close,
// resize) belongs to FloatingPanel — this is only the form.
//
// First line is the headline; outcome defaults to Discrepant — a wrongly-raised
// discrepancy goes into a refusal notice and has to be defended, a clean finding
// raised too cautiously can be looked at again. The control is the same OutcomeSelect
// the findings row uses: one menu, not a pair of chips.
function RaisePanel({ draft, setDraft, onRaise }) {
  const text = draft.text ?? ''
  const firstLine = text.split('\n')[0].trim()
  const ready = firstLine.length > 2
  // Synthetic call — there is no engine value underneath a finding that does not
  // exist yet. The menu still needs the same shape OutcomeSelect reads everywhere.
  const call = { value: draft.outcome ?? 'DISCREPANT', machine: draft.outcome ?? 'DISCREPANT', overridden: false }
  return (
    <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box' }}>
      <TextArea
        value={text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        placeholder={'What is wrong.\nAnything more for the record.'}
        maxLines={8}
        maxLength={900}
        style={{ width: '100%', flex: 1, minHeight: 72, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none', resize: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <OutcomeSelect
          call={call}
          drop="up"
          onPick={(outcome) => setDraft({ ...draft, outcome })}
        />
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
  )
}
