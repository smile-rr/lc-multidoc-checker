import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import { useState, useMemo } from 'react'
import Badge from '@shared/ds/Badge'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import Tabs from '@shared/ds/Tabs'
import SegmentedControl from '@shared/ds/SegmentedControl'
import { PROVENANCE_HIGHLIGHT } from '@shared/lib/tone'
import { plural } from '@shared/lib/format'
import FindingCard from '../components/FindingCard'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import BundleViewer from '../components/BundleViewer'
import DiscrepancyStatement from '../components/DiscrepancyStatement'
import DispositionChips from '../components/DispositionChips'
import { severityMeta } from '../state/severity'
import { useCase } from '../state/CaseContext'

// Stage 4 — the findings.
//
// Findings the engine could not cover come first, under their own heading. That
// ordering is the point: an officer must not be able to work top-to-bottom and
// come away thinking everything was checked. What we didn't check leads.
export default function ReviewScreen({ selectedId, onSelect, onJumpToInterpret }) {
  const { data, visible, officer, actions } = useCase()
  const [grouping, setGrouping] = useState('area')
  const [tab, setTab] = useState('analysis')
  const [showClean, setShowClean] = useState(false)

  const docById = useMemo(() => Object.fromEntries(data.documents.map((d) => [d.id, d])), [data.documents])

  const selected = visible.findings.find((f) => f.id === selectedId) ?? visible.attention[0] ?? visible.findings[0]

  const groups = useMemo(() => {
    const attention = visible.attention
    const manual = attention.filter((f) => f.severity === 'manual')
    const rest = attention.filter((f) => f.severity !== 'manual')

    const body =
      grouping === 'doc'
        ? data.documents
            .map((d) => ({ label: d.docType, items: rest.filter((f) => f.docId === d.id) }))
            .filter((g) => g.items.length)
        : data.areas
            .map((a) => ({ label: a.name, items: rest.filter((f) => f.areaId === a.id) }))
            .filter((g) => g.items.length)

    return [
      ...(manual.length ? [{ label: 'Not Covered', items: manual }] : []),
      ...body,
    ]
  }, [visible.attention, grouping, data.documents, data.areas])

  const counts = {
    discrepancy: visible.attention.filter((f) => f.severity === 'discrepancy').length,
    possible: visible.attention.filter((f) => f.severity === 'possible').length,
    manual: visible.manual.length,
    clean: visible.clean.length,
  }

  if (!selected) {
    return (
      <section className="helix-screen" style={{ padding: '26px 32px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>
          Nothing to review yet — start the review from Intake and findings will appear here as each area comes back.
        </p>
      </section>
    )
  }

  const sev = severityMeta(selected.severity)
  const doc = docById[selected.docId]
  const credit = data.documents.find((d) => d.role === 'credit')
  const draft = officer.drafts[selected.id]
  const savedNote = officer.notes[selected.id] ?? ''
  const noteValue = draft ?? savedNote
  const noteDirty = draft !== undefined && draft !== savedNote

  const isCreditFinding = selected.docId === 'mt700'

  const subtitleFor = (f) => (grouping === 'doc' ? f.area : docById[f.docId]?.docType ?? f.quoteSource)

  return (
    <section className="helix-screen" style={{ padding: '18px 32px 32px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 20px', paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--me-ink)' }}>Findings</h2>
          <span style={{ fontSize: 13, color: 'var(--me-grey-70)' }}>
            {[
              counts.discrepancy ? plural(counts.discrepancy, 'discrepancy', 'discrepancies') : null,
              counts.possible ? `${counts.possible} to decide` : null,
              counts.manual ? `${counts.manual} need your own review` : null,
              counts.clean ? `${counts.clean} clean` : null,
            ].filter(Boolean).join(' · ') || 'Nothing back yet'}
          </span>
        </div>
        <SegmentedControl
          value={grouping}
          onChange={setGrouping}
          items={[
            { id: 'area', label: 'By review area' },
            { id: 'doc', label: 'By document' },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,364px) minmax(460px,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 0' }}>
                <Eyebrow size="sm">{g.label}</Eyebrow>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{plural(g.items.length, 'item')}</span>
              </div>
              {g.items.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  subtitle={subtitleFor(f)}
                  selected={f.id === selected.id}
                  decision={officer.decisions[f.id]}
                  onSelect={() => { onSelect(f.id); setTab('analysis') }}
                  onDecide={(d) => actions.decide(f.id, d)}
                />
              ))}
            </div>
          ))}

          {visible.clean.length ? (
            <>
              <button
                onClick={() => setShowClean((s) => !s)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: 'var(--me-grey)', textAlign: 'left' }}
              >
                <Icon name={showClean ? 'chevron-down' : 'chevron-right'} size={15} color="var(--me-grey-70)" />
                <span>{showClean ? 'Hide' : 'Show'} the {visible.clean.length} areas that came back clean</span>
              </button>
              {showClean ? (
                <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 10, overflow: 'hidden' }}>
                  {visible.clean.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => { onSelect(f.id); setTab('analysis') }}
                      style={{ display: 'flex', gap: 9, alignItems: 'flex-start', textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid var(--me-grey-08)', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      <Icon name="check" size={13} color="var(--status-success)" />
                      <span style={{ fontSize: 12.5, color: 'var(--me-ink)', lineHeight: 1.4 }}>{f.title}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div style={{ ...cardSurface(12), boxShadow: 'none', boxShadow: '0 2px 8px rgba(27,28,30,.06)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--me-grey-15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge tone={sev.tone}>{sev.label}</Badge>
                <Eyebrow size="sm">{selected.area}</Eyebrow>
              </div>
              <DispositionChips variant="labelled" value={officer.decisions[selected.id]} onPick={(d) => actions.decide(selected.id, d)} />
            </div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3, color: 'var(--me-ink)', textWrap: 'pretty' }}>{selected.title}</h3>

            {/* The statement that would go out in the refusal advice. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Eyebrow size="sm" style={{ fontWeight: 400 }}>
                {selected.severity === 'clean' ? 'Result Statement' : 'Discrepancy Statement'}
              </Eyebrow>
              <DiscrepancyStatement text={selected.statement} tone={sev.accent} />
            </div>

            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--me-grey)', textWrap: 'pretty' }}>{selected.detail}</p>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingTop: 4 }}>
              <textarea
                value={noteValue}
                onChange={(e) => actions.dispatch({ type: 'draft_note', findingId: selected.id, text: e.target.value })}
                placeholder="Add a note on this finding — it carries into your decision"
                style={{ flex: 1, minHeight: 38, resize: 'vertical', border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '9px 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--me-ink)', outline: 'none' }}
              />
              {noteDirty ? <Button size="sm" onClick={() => actions.saveNote(selected)}>Save note</Button> : null}
            </div>
          </div>

          <Tabs
            style={{ padding: '10px 22px 0', borderBottom: '1px solid var(--me-grey-15)' }}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'analysis', label: 'Finding' },
              { id: 'source', label: 'Source Pages' },
            ]}
          />

          {tab === 'analysis' ? (
            <div style={{ padding: '14px 22px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MarkdownDoc
                text={selected.analysisMarkdown}
                label="Finding"
                meta={`${selected.checkId ?? 'no check'} · model output`}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
                {selected.trace.map((t) => (
                  <span key={t.key} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--me-grey-70)' }}>
                    {t.key}: {t.value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'source' ? (
            <div style={{ padding: '16px 20px 20px', background: 'var(--me-grey-08)', display: 'grid', gridTemplateColumns: isCreditFinding ? 'minmax(0,1fr)' : '1fr 1fr', gap: 14 }}>
              <SourcePane title="Letter of Credit" meta="parsed by tag">
                <div style={{ height: '100%', overflow: 'auto', padding: '16px 14px', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.85, color: 'var(--me-ink)' }}>
                  {credit.lines.map((l) => (
                    <div
                      key={l.id}
                      style={{ padding: '0 4px', borderRadius: 3, whiteSpace: 'pre-wrap', background: l.id === selected.creditAnchorId ? PROVENANCE_HIGHLIGHT.bg : 'transparent' }}
                    >
                      {l.text}
                    </div>
                  ))}
                </div>
              </SourcePane>

              {/* The presented document is a scan with no text layer, so the pane
                  renders the actual PDF page. It used to render `doc.lines`, which
                  is empty for every scanned document — an empty box. */}
              {isCreditFinding ? null : (
                <SourcePane title={doc?.docType ?? 'Document'} meta={selected.page ? `bundle p.${selected.page}` : selected.quoteSource}>
                  <BundleViewer pdfUrl={data.pdfUrl} page={selected.page ?? doc?.pageRange?.[0] ?? 1} />
                </SourcePane>
              )}

              <button
                onClick={() => onJumpToInterpret(selected)}
                style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
              >
                Open the full document in Interpret →
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SourcePane({ title, meta, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--me-ink)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{meta}</span>
      </div>
      {/* overflow hidden, not auto: the child owns its own scrolling (the PDF
          viewer scrolls through pages), and nesting two scrollers traps the
          wheel between them. */}
      <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', boxShadow: '0 1px 6px rgba(27,28,30,.06)', height: 460, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}
