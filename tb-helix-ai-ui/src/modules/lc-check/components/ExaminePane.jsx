import { useMemo, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Button from '@shared/ds/Button'
import Chip from '@shared/ds/Chip'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import IconButton from '@shared/ds/IconButton'
import TextArea from '@shared/ds/TextArea'
import Select from '@shared/ds/Select'
import Modal from '@shared/ds/Modal'
import PageStrip from '@shared/ds/PageStrip'
import { ellipsis } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
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
// So this pane inverts the flow: document-led rather than finding-led. But
// document-led is not the same as one-document-at-a-time-in-isolation, which is
// what a first pass at this was and what no examiner does.
//
// An examiner holds the credit's requirement in one hand and the document in the
// other. They do not read a bill of lading and then wonder what to think about it —
// they read it *against* the 46A item that called for it, the data fields it has to
// agree with, the 47A condition that touches it, and the article that says how to
// read it. So the layout is the desk:
//
//   documents ─── across the top, so switching costs no column
//   what the credit demands │ the page │ what we read
//
// The credit column is filtered to what bears on the document in front of you.
// Showing the whole credit beside every page would be technically complete and
// practically useless — the examiner would filter it in their head, every time.
//
// Our own uncertainty is promoted to the top of the right column, and that is the
// idea the pane turns on. We already record a confidence per reading and a flag when
// something looked odd; buried in a list that is a risk nobody reads. Surfaced as
// "2 readings we are not sure of" it becomes a directed task — the shortest path to
// the discrepancies our extraction is likeliest to have fumbled.
export default function ExaminePane({ findings, onOpenFinding }) {
  const { data, run, actions } = useCase()
  // Opens on the first *presented* document, not the credit. Examining is reading
  // what was presented against what was demanded; landing on the credit would put
  // the examiner on the thing they are measuring with rather than measuring.
  const [docId, setDocId] = useState(
    (data.documents.find((d) => d.role === 'presented') ?? data.documents[0])?.id ?? null,
  )
  const [page, setPage] = useState(() => (data.documents.find((d) => d.role === 'presented')?.pageRange?.[0] ?? 1))
  const [draft, setDraft] = useState(null)

  // Our segmentation decides which document a tab *means*, and it can be wrong —
  // a page filed under the invoice may belong to the packing list. So the tabs are
  // a starting point, never a boundary: paging runs across the whole bundle, and
  // when a page turns out to sit outside the tab you picked, the tab follows the
  // page rather than the two silently disagreeing. Same rule Interpret uses.
  const picked = data.documents.find((d) => d.id === docId) ?? data.documents[0]
  const pageDocId = useMemo(() => data.bundlePages.find((p) => p.number === page)?.docId ?? null, [data.bundlePages, page])
  const doc = picked?.role === 'credit' ? picked : data.documents.find((d) => d.id === pageDocId) ?? picked
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

  // Turning a page can move which document you are in. Keep the tab in step.
  const goPage = (n) => {
    const next = Math.min(Math.max(1, n), data.totalPages)
    setPage(next)
    const owner = data.bundlePages.find((p) => p.number === next)?.docId
    if (owner && owner !== docId && picked?.role !== 'credit') setDocId(owner)
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

  const demands = data.creditDemands?.[doc.id] ?? null
  const creditFacts = data.facts.filter((f) => f.docId === 'mt700')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Documents across the top: switching document is navigation, not a
          column, and a vertical rail was spending 240px of the desk on it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {data.documents.map((d) => {
          const on = d.id === doc.id
          const doubt = data.facts.filter((f) => f.docId === d.id && ((f.confidence && f.confidence !== 'HIGH') || f.flag)).length
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
              {d.role === 'credit' ? <Icon name="file-text" size={13} /> : null}
              {d.docType}
              {doubt ? <span title={`${doubt} readings we are not sure of`} style={{ fontSize: 10.5, fontWeight: 700, color: '#946400' }}>{doubt}</span> : null}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,320px) minmax(320px,1fr) minmax(300px,360px)', gap: 14, alignItems: 'start' }}>
      <CreditColumn demands={demands} facts={creditFacts} docFacts={docFacts} isCredit={isCredit} />

      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>{doc.docType}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{doc.reference}</span>
          <div style={{ flex: 1 }} />
        </div>
        {isCredit ? null : (
          <div style={{ borderBottom: '1px solid var(--me-grey-15)' }}>
            {/* Every page of the bundle, not just the ones we filed under this
                document. Restricting the strip to the document's own pages is the
                same cage in a nicer shape: reaching page 5 from page 1 should be
                one click, not four Nexts. Which document a page belongs to is
                already answered by the tab, which follows the page. */}
            <PageStrip pages={data.totalPages} activePage={page} onPage={goPage} docLabel={doc.docType} />
          </div>
        )}
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
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Eyebrow size="sm">Read off this document</Eyebrow>
              <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>Our reading of the page — disagree with any of it</span>
            </span>
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

      </div>
      </div>

      <RaiseModal
        draft={draft}
        setDraft={setDraft}
        refs={demands?.refs ?? []}
        onCancel={() => setDraft(null)}
        onRaise={(d) => { const f = actions.raiseFinding(d); setDraft(null); onOpenFinding(f.id) }}
      />
    </div>
  )
}

// What the credit demands of the document in front of you, and the practice that
// governs how to read it. This is the hand an examiner cannot work without.
function CreditColumn({ demands, facts, docFacts, isCredit }) {
  const byLabel = (label) => facts.find((f) => f.label === label)
  const docByLabel = (label) => (label ? docFacts.find((f) => f.label === label) : null)
  if (isCredit) {
    return (
      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--me-grey-15)' }}>
          <Eyebrow size="sm">You are reading the credit</Eyebrow>
        </div>
        <div style={{ padding: '12px 14px', fontSize: 12, lineHeight: 1.6, color: 'var(--me-grey)' }}>
          Pick a presented document above and this column shows what the credit demands of it.
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--me-blue-20)', borderBottom: '1px solid var(--me-grey-15)' }}>
        <Icon name="file-text" size={14} color="var(--me-blue-deep)" />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>Required by the credit</span>
          <span style={{ fontSize: 11, color: 'var(--me-blue-deep)', opacity: 0.85 }}>What this document has to satisfy</span>
        </span>
      </div>
      {!demands ? (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#946400' }}>
            <Icon name="circle-alert" size={13} color="currentColor" />
            The credit does not call for this document
          </span>
          <span style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--me-grey-70)' }}>
            ISBP 821 A31 — a document not required by the credit is disregarded, and may be returned.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {demands.calls ? (
            <Block label="Called for by 46A">
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-ink)' }}>{demands.calls}</span>
            </Block>
          ) : null}
          {demands.fields.length ? (
            <Block label="Must agree with">
              {/* The requirement, and directly beneath it what this page answers
                  with. Two independent lists of labelled values is what made the
                  left and right panels indistinguishable — and the comparison is
                  the examiner's whole act, so it belongs in one place, not split
                  across the screen for them to hold in their head. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {demands.fields.map((pair) => {
                  const c = byLabel(pair.credit)
                  const d = docByLabel(pair.doc)
                  return (
                    <span key={pair.credit} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{pair.credit}{c?.source ? ` · ${c.source}` : ''}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5, color: 'var(--me-ink)', whiteSpace: 'pre-wrap' }}>{c?.value ?? '—'}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingLeft: 10, borderLeft: '2px solid var(--me-grey-15)', marginTop: 2 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', flexShrink: 0 }}>on the document</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: d ? 'var(--me-ink)' : 'var(--me-grey-50)' }}>
                          {d ? d.value : pair.doc ? 'not read' : 'read it yourself'}
                        </span>
                      </span>
                    </span>
                  )
                })}
              </div>
            </Block>
          ) : null}
          {demands.conditions.length ? (
            <Block label="Conditions in 47A">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {demands.conditions.map((c, i) => (
                  <span key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--me-ink)' }}>· {c}</span>
                ))}
              </div>
            </Block>
          ) : null}
          {demands.refs.length ? (
            <Block label="Read it under">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {demands.refs.map((r) => (
                  <Chip key={r} size="sm" tone="neutral" mono>{r}</Chip>
                ))}
              </div>
            </Block>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Block({ label, children }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--me-grey-08)', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Eyebrow size="sm">{label}</Eyebrow>
      {children}
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

// Raising a discrepancy is a deliberate, recorded act, so it gets a surface of its
// own rather than a corner of a column. Crammed into the panel it read as a nervous
// afterthought — and a form that feels like an afterthought produces findings that
// look like one, which is the wrong signal on something that ends up in a refusal
// advice.
//
// Where it was seen is pre-filled from where the officer was standing: a finding
// whose provenance was typed from memory is worth less than one the interface
// recorded. The article being relied on is offered, not demanded — an examiner often
// knows a document is wrong before they know which article says so, and forcing the
// citation first would either block the finding or invite a guess.
function RaiseModal({ draft, setDraft, refs, onCancel, onRaise }) {
  if (!draft) return null
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value })
  const ready = draft.title.trim().length > 2
  const toggleRef = (r) =>
    setDraft({ ...draft, refs: (draft.refs ?? []).includes(r) ? draft.refs.filter((x) => x !== r) : [...(draft.refs ?? []), r] })

  return (
    <Modal
      open
      onClose={onCancel}
      width={620}
      title="Raise a finding of your own"
      subtitle="It joins the findings marked as yours, with no check behind it — which is the honest record."
      footer={
        <>
          <span style={{ fontSize: 11.5, color: ready ? 'var(--me-grey-70)' : '#946400' }}>
            {ready ? 'Recorded against your name, with the document and page it came from.' : 'Say what is wrong before raising it — the line goes on the record.'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--me-grey-70)' }}>Cancel</button>
            <Button variant="primary" size="md" onClick={() => onRaise(draft)} disabled={!ready}>Raise it</Button>
          </span>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Provenance, stated rather than asked for. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', background: 'var(--me-grey-08)', borderRadius: 10 }}>
          <Eyebrow size="sm">Seen on</Eyebrow>
          <span style={{ fontSize: 12.5, color: 'var(--me-ink)' }}>{draft.quoteSource || 'this document'}</span>
          {draft.quote ? (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--me-grey)', whiteSpace: 'pre-wrap' }}>{draft.quote}</span>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>No reading cited — you can quote one by raising from a row on the right.</span>
          )}
        </div>

        <Field label="What is wrong" hint="One line, as it would read on a refusal advice.">
          <input
            value={draft.title}
            onChange={set('title')}
            autoFocus
            placeholder="e.g. Invoice does not quote the contract number required by 47A"
            style={{ width: '100%', height: 42, border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '0 12px', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--me-ink)', outline: 'none' }}
          />
        </Field>

        <Field label="Why it matters" hint="What the credit or the rules require, and what the document shows instead.">
          <TextArea
            value={draft.detail}
            onChange={set('detail')}
            placeholder="The credit requires… the document shows… so…"
            maxLines={8}
            maxLength={900}
            style={{ width: '100%', border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.65, color: 'var(--me-ink)', outline: 'none' }}
          />
        </Field>

        {refs.length ? (
          <Field label="Relying on" hint="Optional — the practice governing this document. Add it if you know it.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {refs.map((r) => {
                const on = (draft.refs ?? []).includes(r)
                return (
                  <Chip key={r} size="md" mono tone={on ? 'blue' : 'plain'} onClick={() => toggleRef(r)}>
                    {on ? <Icon name="check" size={11} /> : null}
                    {r}
                  </Chip>
                )
              })}
            </div>
          </Field>
        ) : null}

        <Field label="How you would call it">
          <Select
            size="md"
            value={draft.severity}
            onChange={set('severity')}
            options={[
              { value: 'discrepancy', label: 'A discrepancy — the presentation does not comply' },
              { value: 'possible', label: 'To decide — worth a second look before it is called' },
            ]}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>{label}</span>
        {hint ? <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{hint}</span> : null}
      </span>
      {children}
    </div>
  )
}
