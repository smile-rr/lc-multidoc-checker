import { useMemo, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Button from '@shared/ds/Button'
import Chip from '@shared/ds/Chip'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import IconButton from '@shared/ds/IconButton'
import TextArea from '@shared/ds/TextArea'
import Select from '@shared/ds/Select'
import { ellipsis } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
import DocRail from './DocRail'
import BundleViewer from './BundleViewer'
import { useCase } from '../state/CaseContext'

// Examine the documents yourself.
//
// The engine's findings are a head start, not the examination. Under UCP 600 art.
// 14(a) the bank examines the documents; a list of what our checks happened to
// look at is not that. Three things it cannot cover, all of which end up here:
//
//   · OCR read a box wrong, or could not read it at all
//   · we read the right box and drew the wrong conclusion
//   · the credit states something no card in the dictionary covers
//
// So this pane inverts the flow: document-led rather than finding-led. Left, the
// bundle. Middle, the page. Right, what we made of that page — and crucially, our
// own uncertainty promoted to the top of it.
//
// That promotion is the design. We already record a confidence per extracted fact
// and a flag when something looked odd; buried in a list, that is a risk nobody
// reads. Surfaced as "2 things on this page we could not read confidently", it
// becomes a directed task — the shortest path to the discrepancies our extraction
// is most likely to have missed. Our weakness, turned into someone's next click.
export default function ExaminePane({ findings, onOpenFinding }) {
  const { data, run, actions } = useCase()
  const [docId, setDocId] = useState(data.documents[0]?.id ?? null)
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(null)

  const doc = data.documents.find((d) => d.id === docId) ?? data.documents[0]
  const isCredit = doc?.role === 'credit'
  const docFacts = useMemo(() => data.facts.filter((f) => f.docId === doc?.id), [data.facts, doc])

  // Ours to doubt first: anything we could not read confidently, or flagged as
  // odd while reading it.
  const doubtful = docFacts.filter((f) => (f.confidence && f.confidence !== 'HIGH') || f.flag)
  const confident = docFacts.filter((f) => !doubtful.includes(f))
  const docFindings = findings.filter((f) => f.docId === doc?.id)

  const selectDoc = (id) => {
    setDocId(id)
    setDraft(null)
    const d = data.documents.find((x) => x.id === id)
    if (d?.pageRange) setPage(d.pageRange[0])
  }

  // Raising starts from what you were looking at, so the record carries where it
  // came from without anyone having to retype it.
  const startDraft = (fact) =>
    setDraft({
      title: '',
      detail: '',
      severity: 'possible',
      docId: doc?.id ?? null,
      page: fact?.page ?? page,
      quote: fact ? `${fact.label}: ${fact.value}` : '',
      quoteSource: `${doc?.docType ?? 'Document'}${fact?.page ? `, p.${fact.page}` : ''}`,
    })

  if (!doc) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) minmax(320px,1fr) minmax(320px,400px)', gap: 14, alignItems: 'start' }}>
      <DocRail
        documents={data.documents}
        selectedId={doc.id}
        onSelect={selectDoc}
        segmented={run.segmented}
        segmentTotal={run.segmentTotal}
      />

      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>{doc.docType}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{doc.reference}</span>
          <div style={{ flex: 1 }} />
          {!isCredit && doc.pageRange ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconButton icon="chevron-left" size="sm" title="Previous page" onClick={() => setPage((p) => Math.max(doc.pageRange[0], p - 1))} disabled={page <= doc.pageRange[0]} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>p.{page}</span>
              <IconButton icon="chevron-right" size="sm" title="Next page" onClick={() => setPage((p) => Math.min(doc.pageRange[1], p + 1))} disabled={page >= doc.pageRange[1]} />
            </span>
          ) : null}
        </div>
        {isCredit ? (
          <div style={{ maxHeight: 620, overflow: 'auto', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.85, color: 'var(--me-ink)' }}>
            {doc.lines?.map((l) => (
              <div key={l.id} style={{ whiteSpace: 'pre-wrap' }}>{l.text}</div>
            ))}
          </div>
        ) : (
          <BundleViewer pdfUrl={data.pdfUrl} page={page} />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* What we could not read. First, because it is the likeliest place
            something was missed and the cheapest place to look. */}
        <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', borderColor: doubtful.length ? '#E9C97A' : 'var(--me-grey-15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: doubtful.length ? '#FBEFCF' : 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)' }}>
            <Icon name={doubtful.length ? 'circle-alert' : 'circle-check'} size={14} color={doubtful.length ? '#946400' : 'var(--status-success)'} />
            <span style={{ fontSize: 12, fontWeight: 600, color: doubtful.length ? '#946400' : 'var(--me-grey)' }}>
              {doubtful.length
                ? `${plural(doubtful.length, 'reading')} we are not sure of`
                : 'We read every field on this document confidently'}
            </span>
          </div>
          {doubtful.length ? (
            <div style={{ padding: '4px 0' }}>
              {doubtful.map((f, i) => (
                <FactRow key={i} fact={f} doubtful onRaise={() => startDraft(f)} onGo={() => f.page && setPage(f.page)} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Everything else we read, so a human can disagree with any of it. */}
        <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)' }}>
            <Eyebrow size="sm">What we read here</Eyebrow>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{confident.length}</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => startDraft(null)}>
              <Icon name="flag" size={13} />Raise a finding
            </Button>
          </div>
          <div style={{ maxHeight: 300, overflow: 'auto', padding: '4px 0' }}>
            {confident.map((f, i) => (
              <FactRow key={i} fact={f} onRaise={() => startDraft(f)} onGo={() => f.page && setPage(f.page)} />
            ))}
            {!confident.length ? <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--me-grey-70)' }}>Nothing extracted from this document.</div> : null}
          </div>
        </div>

        {docFindings.length ? (
          <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)' }}>
              <Eyebrow size="sm">Already found on this document</Eyebrow>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{docFindings.length}</span>
            </div>
            {docFindings.map((f) => (
              <button key={f.id} onClick={() => onOpenFinding(f.id)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderBottom: '1px solid var(--me-grey-08)', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Icon name="dot" size={14} color="var(--me-grey-50)" />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--me-ink)' }}>{f.title}</span>
              </button>
            ))}
          </div>
        ) : null}

        {draft ? <RaiseForm draft={draft} setDraft={setDraft} onCancel={() => setDraft(null)} onRaise={(d) => { const f = actions.raiseFinding(d); setDraft(null); onOpenFinding(f.id) }} /> : null}
      </div>
    </div>
  )
}

// One thing we read off the page. `Raise` is on every row rather than only the
// doubtful ones, because a confident misreading is still a misreading — and the
// officer, not us, decides which of our readings to trust.
function FactRow({ fact, doubtful, onRaise, onGo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 14px' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{fact.label}</span>
          {fact.confidence && fact.confidence !== 'HIGH' ? (
            <Chip size="sm" tone={fact.confidence === 'LOW' ? 'error' : 'warning'}>{fact.confidence === 'LOW' ? 'could not read' : 'unsure'}</Chip>
          ) : null}
        </span>
        <span style={{ ...ellipsis, fontSize: 12.5, color: 'var(--me-ink)' }}>{fact.value}</span>
        {fact.flag ? <span style={{ fontSize: 11, lineHeight: 1.45, color: '#946400' }}>{fact.flag}</span> : null}
      </span>
      {fact.page ? <IconButton icon="file-search" size="sm" title={`Show page ${fact.page}`} onClick={onGo} /> : null}
      <IconButton icon="flag" size="sm" title={doubtful ? 'Raise a finding from this reading' : 'Disagree with this reading and raise it'} onClick={onRaise} />
    </div>
  )
}

// Enough to be auditable, and nothing more. Where it was seen is pre-filled from
// where you were standing, because a finding whose provenance was typed from
// memory is worth less than one the interface recorded.
function RaiseForm({ draft, setDraft, onCancel, onRaise }) {
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value })
  const ready = draft.title.trim().length > 2
  return (
    <div style={{ ...cardSurface(12), boxShadow: '0 6px 20px rgba(27,28,30,.10)', borderColor: 'var(--me-blue)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--me-blue-20)', borderBottom: '1px solid var(--me-grey-15)' }}>
        <Icon name="flag" size={14} color="var(--me-blue-deep)" />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>Raise a finding of your own</span>
        <IconButton icon="x" size="sm" title="Cancel" onClick={onCancel} />
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>
          On {draft.quoteSource || 'this document'}
          {draft.quote ? ` — ${draft.quote}` : ''}
        </span>
        <input
          value={draft.title}
          onChange={set('title')}
          placeholder="What is wrong, in one line"
          style={{ width: '100%', height: 38, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '0 11px', fontFamily: 'inherit', fontSize: 13, color: 'var(--me-ink)', outline: 'none' }}
        />
        <TextArea
          value={draft.detail}
          onChange={set('detail')}
          placeholder="Why it matters, and what the credit or the rules require…"
          maxLines={6}
          maxLength={600}
          style={{ width: '100%', border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <Select
            size="sm"
            value={draft.severity}
            onChange={set('severity')}
            options={[
              { value: 'discrepancy', label: 'A discrepancy' },
              { value: 'possible', label: 'To decide' },
            ]}
            style={{ height: 34 }}
          />
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--me-grey-70)' }}>Cancel</button>
          <Button variant="primary" size="sm" onClick={() => onRaise(draft)} disabled={!ready}>Raise it</Button>
        </div>
        {!ready ? <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>Say what is wrong before raising it — the line goes on the record.</span> : null}
      </div>
    </div>
  )
}
