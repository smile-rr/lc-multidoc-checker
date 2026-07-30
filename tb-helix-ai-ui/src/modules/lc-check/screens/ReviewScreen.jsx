import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import { useState, useMemo } from 'react'
import Badge from '@shared/ds/Badge'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import Tabs from '@shared/ds/Tabs'
import SegmentedControl from '@shared/ds/SegmentedControl'
import { PROVENANCE_HIGHLIGHT } from '@shared/lib/tone'
import Chip from '@shared/ds/Chip'
import { ellipsis } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
import FindingCard from '../components/FindingCard'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import BundleViewer from '../components/BundleViewer'
import ExaminePane from '../components/ExaminePane'
import DiscrepancyStatement from '../components/DiscrepancyStatement'
import DispositionChips from '../components/DispositionChips'
import { severityMeta, dispositionLabel } from '../state/severity'
import { useCase } from '../state/CaseContext'

// Stage 4 — the findings.
//
// Findings the engine could not cover come first, under their own heading. That
// ordering is the point: an officer must not be able to work top-to-bottom and
// come away thinking everything was checked. What we didn't check leads.
//
// The plan's structure carries through, deliberately: same groups, same two
// densities, same words. Learning one screen should teach you the other.
//
// **Grouped by kind, by default.** A finding inherits the kind of the check that
// settled it, and that is the grouping for the same reasons it is on the plan: it
// needs no expertise to read, and it is the same on every credit. It is also the
// most useful sweep an officer has — rule findings are arithmetic and can be agreed
// or rejected quickly, agent findings are where the reading time belongs, so
// grouping by it puts the fast work in one place.
//
// One alternative, not three. "By review area" is gone: an area is which of our
// agents ran the check, which is a fact about our implementation and means nothing
// to a reader who does not already know our agent names. "By document" stays,
// because it answers a real question an examiner asks — *what is wrong with the
// bill of lading?* — and it is a thing you can point at on a desk.
//
// **"Not covered" is not a group.** It used to be, and that was wrong: if a finding
// belongs to no rule card and no requirement card, where did it come from? The
// answer is that the planner read a condition out of the credit and found nothing in
// the dictionary that covers it — so it *is* a requirement, one we have no card for.
// A category made it look like a legitimate third kind of finding when it is a gap
// in the catalogue, which is a thing to fix in Governance, not a bucket to file in.
// So it is a flag on the finding, with the fix offered next to it.
//
// The third group is provenance, not kind: **Raised by you**. A person examining the
// pages is the backstop for everything OCR mangled and every condition no card
// covers, and what they raise is theirs — not a check's output, and a refusal advice
// has to be able to say so.
//
// Uncovered findings still lead their group, because an officer must not be able to
// work top-to-bottom and come away thinking everything was checked.
export default function ReviewScreen({ selectedId, onSelect, onJumpToInterpret }) {
  const { data, visible, officer, actions } = useCase()
  // Two jobs, not two views of one job. "Findings" is checking what we found;
  // "Examine" is looking for what we did not — which is document-led, and is the
  // only route to a discrepancy our extraction fumbled. Neither contains the other,
  // so it is a mode, not a grouping.
  const [mode, setMode] = useState('findings')
  const [grouping, setGrouping] = useState('kind')
  const [tab, setTab] = useState('analysis')
  const [showClean, setShowClean] = useState(false)

  const docById = useMemo(() => Object.fromEntries(data.documents.map((d) => [d.id, d])), [data.documents])

  // Optional now. Nothing selected is a state worth being in — the whole list at
  // once, which is how you see how much is left and what shape it is. It used to
  // auto-select the first item, which saves a click and costs the overview.
  const selected = selectedId ? visible.findings.find((f) => f.id === selectedId) ?? null : null

  const groups = useMemo(() => {
    // Two different gaps, and they call for different fixes, so they are marked
    // differently rather than lumped as "not covered":
    //
    //   no card      nothing in the dictionary covers this. A governance gap —
    //                somebody should author a card for it.
    //   not settled  a card ran and could not conclude, so it handed the question
    //                to a person. The card is too weak, or the data was not there.
    //
    // Both are the engine admitting something, which is why they lead their group.
    const rest = visible.attention.map((f) => ({
      ...f,
      gap: f.raisedByOfficer ? null : !f.checkId ? 'no card' : f.severity === 'manual' ? 'not settled' : null,
    }))

    const kindOf = (f) => data.checks.find((c) => c.id === f.checkId)?.kind ?? null
    // Uncovered first inside whichever group holds them: they are the ones nothing
    // examined, so they are the ones most easily skipped.
    const gapsFirst = (a, b) => (!!b.gap) - (!!a.gap)

    const body =
      grouping === 'doc'
        ? data.documents
            .map((d) => ({ label: d.docType, items: rest.filter((f) => f.docId === d.id).sort(gapsFirst) }))
            .filter((g) => g.items.length)
        : [
            { label: 'Rule', icon: 'equal', tone: 'blue', note: 'The system compared fields. Same answer every time.', items: rest.filter((f) => kindOf(f) === 'rule').sort(gapsFirst) },
            { label: 'Requirement', icon: 'list-checks', tone: 'green', note: 'An agent read it, or should have.', items: rest.filter((f) => kindOf(f) !== 'rule' && !f.raisedByOfficer).sort(gapsFirst) },
            { label: 'Raised by you', icon: 'flag', tone: 'neutral', note: 'Yours, not a check\'s. Marked as such wherever it appears.', items: rest.filter((f) => f.raisedByOfficer) },
          ].filter((g) => g.items.length)

    return body
  }, [visible.attention, grouping, data.documents, data.areas, data.checks])

  const counts = {
    discrepancy: visible.attention.filter((f) => f.severity === 'discrepancy').length,
    possible: visible.attention.filter((f) => f.severity === 'possible').length,
    manual: visible.manual.length,
    clean: visible.clean.length,
  }

  if (!visible.findings.length) {
    return (
      <section className="helix-screen" style={{ padding: '26px 32px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>
          Nothing to review yet — start the review from Intake and findings will appear here as each area comes back.
        </p>
      </section>
    )
  }

  const sev = selected ? severityMeta(selected.severity) : null
  const doc = selected ? docById[selected.docId] : null
  const credit = data.documents.find((d) => d.role === 'credit')
  const draft = selected ? officer.drafts[selected.id] : undefined
  const savedNote = selected ? officer.notes[selected.id] ?? '' : ''
  const noteValue = draft ?? savedNote
  const noteDirty = draft !== undefined && draft !== savedNote

  const isCreditFinding = selected?.docId === 'mt700'

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
        {/* The mode is the only control at this level, because it is the only one
            that changes what you are doing. The grouping went down onto the list it
            arranges — see the note there. Two segmented controls side by side read
            as one tier, and then neither says which it is. */}
        <SegmentedControl
          value={mode}
          onChange={setMode}
          items={[
            { id: 'findings', label: 'Findings', tip: 'Check what we found' },
            { id: 'examine', label: 'Examine the documents', tip: 'Read the pages yourself and raise what we missed' },
          ]}
        />
      </div>

      {mode === 'examine' ? (
        <ExaminePane findings={visible.findings} onOpenFinding={(id) => { onSelect(id); setMode('findings'); setTab('analysis') }} />
      ) : (

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(280px,340px) minmax(460px,1fr)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {selected ? null : (
          <FindingsTable
            groups={groups}
            clean={visible.clean}
            decisions={officer.decisions}
            docById={docById}
            grouping={grouping}
            setGrouping={setGrouping}
            onSelect={(id) => { onSelect(id); setTab('analysis') }}
          />
        )}
        {selected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* The way back. Focus mode had no exit, so selecting a finding made the
              overview unreachable — and the overview is the default state. */}
          <button
            onClick={() => onSelect(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--me-blue)' }}
          >
            <Icon name="arrow-left" size={14} />
            All findings
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eyebrow size="sm">Grouped by</Eyebrow>
            <SegmentedControl size="sm" value={grouping} onChange={setGrouping} items={[{ id: 'kind', label: 'Kind' }, { id: 'doc', label: 'Document' }]} />
          </div>
          {groups.map((g) => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 0' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <Eyebrow size="sm">{g.label}</Eyebrow>
                  {g.note ? <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{g.note}</span> : null}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)', flexShrink: 0 }}>{plural(g.items.length, 'item')}</span>
              </div>
              {g.items.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  kind={data.checks.find((c) => c.id === f.checkId)?.kind ?? null}
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
        ) : null}

        {selected ? (
        <div style={{ ...cardSurface(12), boxShadow: '0 2px 8px rgba(27,28,30,.06)', overflow: 'hidden' }}>
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
            <div style={{ padding: '14px 22px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* A computed finding has no reasoning to read — nothing formed a
                  view, two values were compared. So the evidence is the
                  arithmetic: both sides, where each was read, and which row
                  failed. Checking it is checking a sum, which is quick, and
                  labelling it "model output" would have been a lie. */}
              {selected.comparison ? <Comparison outcome={selected.comparison} /> : null}
              <MarkdownDoc
                text={selected.analysisMarkdown}
                label={selected.comparison ? 'How it reads' : 'Finding'}
                meta={`${selected.checkId ?? 'no check'} · ${selected.statementSource === 'derived' ? 'derived from the rule' : selected.statementSource === 'officer' ? 'raised by you' : 'model output'}`}
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
        ) : null}
      </div>
      )}
    </section>
  )
}

// The arithmetic behind a computed finding.
function Comparison({ outcome }) {
  const TONE = {
    fail: { border: 'var(--status-error)', bg: '#FBE3E1', label: 'failed' },
    pass: { border: 'var(--me-grey-15)', bg: '#fff', label: 'held' },
    unanswerable: { border: '#E9C97A', bg: '#FBEFCF', label: 'could not be answered' },
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Eyebrow size="sm">Compared</Eyebrow>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{outcome.scope}</span>
      </div>
      {outcome.rows.map((r, i) => {
        const t = TONE[r.verdict] ?? TONE.pass
        return (
          <div key={i} style={{ border: `1px solid ${t.border}`, background: t.bg, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <Side o={r.left} />
              <span style={{ fontWeight: 600, color: 'var(--me-blue-deep)' }}>{r.op}</span>
              <Side o={r.right} />
              {r.tol ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>({r.tol})</span> : null}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: r.verdict === 'fail' ? 'var(--status-error)' : r.verdict === 'unanswerable' ? '#946400' : 'var(--me-grey-70)' }}>{t.label}</span>
            </div>
          </div>
        )
      })}
      <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>
        Raised as: {outcome.message}
      </span>
    </div>
  )
}

function Side({ o }) {
  if (!o) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: 'var(--me-ink)' }}>{o.field}</span>
      {o.doc ? <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)' }}>@ {o.doc}</span> : null}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: o.resolved ? 'var(--me-ink)' : '#946400' }}>
        {o.resolved ? o.value : 'not extracted'}
      </span>
    </span>
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

// The whole findings list, one line each — the same shape the plan uses, for the
// same reason: seeing how much is left, and what kind of work it is, is a question
// about the list rather than about any one item. Your call is a column, so progress
// is readable without opening anything.
const FCOLS = {
  display: 'grid',
  gridTemplateColumns: '22px 96px minmax(0,1.7fr) minmax(0,1fr) minmax(0,0.8fr) 104px',
  gap: 14,
  alignItems: 'center',
}

function FindingsTable({ groups, clean, decisions, docById, grouping, setGrouping, onSelect }) {
  const [showClean, setShowClean] = useState(false)
  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ ...FCOLS, padding: '9px 16px', borderBottom: '1px solid var(--me-grey-15)' }}>
        <span />
        <Eyebrow size="sm">Check</Eyebrow>
        <Eyebrow size="sm">Finding</Eyebrow>
        <Eyebrow size="sm">On</Eyebrow>
        <Eyebrow size="sm">Cited as</Eyebrow>
        <Eyebrow size="sm">Your call</Eyebrow>
      </div>

      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap' }}>
            <Chip size="sm" tone={g.tone ?? 'neutral'}>
              {g.icon ? <Icon name={g.icon} size={11} /> : null}
              {g.label}
            </Chip>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{g.items.length}</span>
            {g.note ? <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{g.note}</span> : null}
          </div>
          {g.items.map((f) => (
            <FindingRow key={f.id} finding={f} decision={decisions[f.id]} docById={docById} onSelect={() => onSelect(f.id)} />
          ))}
        </div>
      ))}

      {clean.length ? (
        <div>
          <button onClick={() => setShowClean((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 16px', border: 'none', borderTop: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={showClean ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
            <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{plural(clean.length, 'area')} came back clean</span>
          </button>
          {showClean
            ? clean.map((f) => <FindingRow key={f.id} finding={f} decision={decisions[f.id]} docById={docById} onSelect={() => onSelect(f.id)} />)
            : null}
        </div>
      ) : null}
    </div>
  )
}

function FindingRow({ finding, decision, docById, onSelect }) {
  const sev = severityMeta(finding.severity)
  const kind = finding.settledBy
  return (
    <button
      onClick={onSelect}
      title={finding.title}
      style={{ ...FCOLS, width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--me-grey-08)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <span title={sev.label} style={{ width: 9, height: 9, borderRadius: '50%', background: sev.dot, justifySelf: 'center' }} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {finding.raisedByOfficer ? (
          <span title="You raised this" style={{ display: 'flex', flexShrink: 0, color: 'var(--me-grey)' }}><Icon name="flag" size={11} color="currentColor" /></span>
        ) : finding.gap ? (
          <span title={finding.gap === 'no card' ? 'No card in the dictionary covers this — a gap to close in Governance' : 'A card ran and could not conclude, so it handed the question to you'} style={{ display: 'flex', flexShrink: 0, color: '#946400' }}><Icon name="circle-alert" size={11} color="currentColor" /></span>
        ) : kind ? (
          <span title={kind === 'rule' ? 'Computed by a rule' : 'Read by an agent'} style={{ display: 'flex', flexShrink: 0, color: kind === 'rule' ? 'var(--me-blue-deep)' : '#1F7A00' }}>
            <Icon name={kind === 'rule' ? 'equal' : 'list-checks'} size={11} color="currentColor" />
          </span>
        ) : null}
        <span style={{ ...ellipsis, fontFamily: 'var(--font-mono)', fontSize: 11, color: finding.checkId ? 'var(--me-grey-70)' : finding.raisedByOfficer ? 'var(--me-grey-70)' : '#946400' }}>
          {finding.checkId ?? (finding.raisedByOfficer ? 'yours' : 'no card')}
        </span>
        <span style={{ ...ellipsis, fontSize: 10, color: '#946400' }}>
          {finding.gap === 'not settled' ? 'not settled' : ''}
        </span>
      </span>

      <span style={{ ...ellipsis, fontSize: 12.5, color: 'var(--me-ink)' }}>{finding.title}</span>

      <span style={{ ...ellipsis, fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        {docById[finding.docId]?.docType ?? finding.quoteSource ?? '—'}
      </span>

      <span style={{ ...ellipsis, fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        {finding.source ? SOURCE_LABEL[finding.source] : '—'}
      </span>

      {/* The one column that is about you rather than the finding. Blank is not
          "no opinion" — it is work outstanding, so it says so. */}
      <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
        {decision ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--me-ink)' }}>
            <Icon name="check" size={12} color="var(--status-success)" />
            {dispositionLabel(decision)}
          </span>
        ) : (
          <span style={{ color: 'var(--me-blue)' }}>needs you</span>
        )}
      </span>
    </button>
  )
}

const SOURCE_LABEL = { credit: 'the credit', practice: 'UCP / ISBP', policy: 'bank policy' }
