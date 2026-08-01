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
import { ellipsis, clampLines } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import BundleViewer from '../components/BundleViewer'
import ExaminePane from '../components/ExaminePane'
import ResizeHandle from '@shared/ds/ResizeHandle'
import { PANE_FILL } from '../components/paneHeight'
import DiscrepancyStatement from '../components/DiscrepancyStatement'
import OutcomeSelect from '../components/OutcomeSelect'
import OutcomeCell, { OutcomeMark } from '../components/OutcomeCell'
import { outcomeMeta, initialsOf } from '../state/outcome'
import { settledBy, bySettledBy } from '../data/checkSpecs'
import { groupByKind, kindOf, kindMark } from '../state/findingKinds'
import { useRailNav } from '../state/useRailNav'
import KindGroupHeader from '../components/KindGroupHeader'
import ConditionRows from '../components/ConditionRows'
import Notice from '@shared/ds/Notice'
import TierTag from '../components/TierTag'
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
// **Grouped by where the card came from. One arrangement, no control.** A Rule card
// is standing, approved and the same on every credit; a Requirement card was read out
// of *this* credit's 46A/47A during the run and reviewed by nobody. That is the
// difference that decides who can answer for a finding, and it needs no expertise to
// read.
//
// How it was settled — exact or judged — rides on the row instead of splitting the
// list, because it answers a different question: not *who can answer for this* but
// *how far can I trust it*.
//
// Two alternatives have been removed rather than offered. "By review area" was which
// of our agents ran the rule — a fact about our implementation that means nothing to a
// reader who does not know our agent names. "By document" answered a question an
// examiner does ask, but Examine already answers it far better: it is document-led by
// construction, with the pages in front of you. A grouping control that switches
// between one good arrangement and one redundant one is a decision the officer has to
// make before they can start reading, in exchange for nothing.
//
// **"Not covered" is not a group.** It used to be, and that was wrong: if a finding
// belongs to no rule, where did it come from? The answer is that the planner read a
// requirement out of the credit and found nothing in the dictionary that tests it. A
// category made that look like a legitimate third kind of finding when it is a gap in
// the rulebook — a thing to fix in Governance, not a bucket to file in. So it is a
// flag on the finding, with the fix offered next to it.
//
// The third group is provenance, not tier: **Raised by you**. A person examining the
// pages is the backstop for everything OCR mangled and every requirement no rule
// covers, and what they raise is theirs — not a rule's output, and a refusal advice
// has to be able to say so.
//
// Uncovered findings still lead their group, because an officer must not be able to
// work top-to-bottom and come away thinking everything was checked.
export default function ReviewScreen({ selectedId, onSelect, onJumpToInterpret }) {
  const { data, run, visible, officer, callOf, actions } = useCase()
  // The check that produced each finding. Coverage — and so who was settling it —
  // lives on the plan check; a finding carries only its tier.
  const checkById = useMemo(() => Object.fromEntries(data.checks.map((c) => [c.id, c])), [data.checks])
  // Two jobs, not two views of one job. "Findings" is checking what we found;
  // "Manual Check" is reading the credit against a presented page yourself — the
  // only route to a discrepancy our extraction fumbled. Neither contains the other,
  // so it is a mode, not a grouping.
  const [mode, setMode] = useState('findings')
  const [tab, setTab] = useState('analysis')
  const [showClean, setShowClean] = useState(false)
  // How wide the rail sits when a finding is open. On the screen rather than per
  // finding, so picking the next one does not undo the width you just set.
  const [railWidth, setRailWidth] = useState(316)

  const docById = useMemo(() => Object.fromEntries(data.documents.map((d) => [d.id, d])), [data.documents])

  // Optional now. Nothing selected is a state worth being in — the whole list at
  // once, which is how you see how much is left and what shape it is. It used to
  // auto-select the first item, which saves a click and costs the overview.
  const selected = selectedId ? visible.findings.find((f) => f.id === selectedId) ?? null : null

  const groups = useMemo(() => {
    // One gap is worth a mark of its own: nothing on the plan covers this at all, so
    // somebody should author a check for it in Governance. It leads its group, because
    // it is the engine admitting a hole rather than reporting a result.
    //
    // "A check ran and could not conclude" used to be marked here too. The Outcome
    // column says that now, in the same word the plan uses, so the mark was a second
    // notation for something already stated — and one an officer had to be taught.
    const rest = visible.attention.map((f) => ({
      ...f,
      // Who gives the answer — and an override makes that a person, which is what
      // `manual` means. The tag on the row says the same thing from the same rule, so
      // a finding the officer settled reads as theirs and sorts with the rest of the
      // work only a person could do.
      who: callOf(f).overridden
        ? 'manual'
        : f.checkId && checkById[f.checkId] ? settledBy(checkById[f.checkId]) : 'agent',
      // Only one gap is worth a mark: nothing on the plan covers this at all, which
      // is a hole in the rulebook to close in Governance. It used to also flag every
      // `manual` finding as "not settled" — a third name for what the Outcome column
      // now says in words, and one an officer had to be taught.
      gap: !f.raisedByOfficer && !f.checkId ? 'no rule' : null,
    }))

    // Two keys, and the first one outranks the sequence deliberately.
    //
    // **Uncovered first.** They are the ones nothing examined, so they are the ones
    // most easily skipped — and an officer must not be able to work top-to-bottom and
    // come away thinking everything was checked.
    //
    // **Then the plan's own order**, by who settles it: comparison, agent, manual. The
    // officer worked the plan in that sequence and arrives here having read it; a
    // findings list in some other order means re-finding all of it. One definition,
    // in `checkSpecs`, shared with Plan & Execute and with Decision.
    const gapsFirst = (a, b) => (!!b.gap) - (!!a.gap)
    const order = bySettledBy((f) => f.who)
    const planOrder = (a, b) => gapsFirst(a, b) || order(a, b)

    // One arrangement, shared with Decision — see `state/findingKinds`.
    return groupByKind(rest, planOrder)
  }, [visible.attention, callOf])

  // Read through the officer's calls, not the engine's raw values — a discrepancy
  // somebody cleared has to leave this count, or the header and the list under it
  // disagree about the same twenty rows.
  const counts = {
    discrepant: visible.attention.filter((f) => callOf(f).value === 'DISCREPANT').length,
    doubt: visible.doubt.length,
    clean: visible.clean.length,
  }

  // Visible rail order in focus mode — clean stays out until unfolded.
  const railIds = useMemo(() => {
    const out = []
    for (const g of groups) for (const f of g.items) out.push(f.id)
    if (showClean) for (const f of visible.clean) out.push(f.id)
    return out
  }, [groups, showClean, visible.clean])

  useRailNav({
    ids: railIds,
    selectedId,
    enabled: mode === 'findings',
    onSelect: (id) => { onSelect(id); setTab('analysis') },
    onClear: () => onSelect(null),
  })

  if (!visible.findings.length) {
    return (
      <section className="helix-screen" style={{ padding: '26px 32px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>
          Nothing to review yet — start the review from Intake and findings will appear here as each area comes back.
        </p>
      </section>
    )
  }

  const call = selected ? callOf(selected) : null
  const sev = call ? outcomeMeta(call.value) : null
  const doc = selected ? docById[selected.docId] : null
  const credit = data.documents.find((d) => d.role === 'credit')
  const draft = selected ? officer.drafts[selected.id] : undefined
  const savedNote = selected ? officer.notes[selected.id] ?? '' : ''
  const noteValue = draft ?? savedNote
  const noteDirty = draft !== undefined && draft !== savedNote

  // Which document a finding sits in is answered by the document's role, never by a
  // doc code — the credit's code names the file, and the file is not always an MT700.
  const isCreditFinding = selected?.docId === data.documents.find((d) => d.role === 'credit')?.id

  const subtitleFor = (f) => docById[f.docId]?.docType ?? f.quoteSource

  return (
    <section className="helix-screen" style={{ padding: '18px 32px 16px', ...PANE_FILL, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 20px', paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--me-ink)' }}>Findings</h2>
          <span style={{ fontSize: 13, color: 'var(--me-grey-70)' }}>
            {[
              counts.discrepant ? plural(counts.discrepant, 'discrepancy', 'discrepancies') : null,
              counts.doubt ? `${counts.doubt} in doubt` : null,
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
            { id: 'examine', label: 'Manual Check', tip: 'Read the credit against a presented document and raise what you see' },
          ]}
        />
      </div>

      {mode === 'examine' ? (
        <ExaminePane onOpenFinding={(id) => { onSelect(id); setMode('findings'); setTab('analysis') }} />
      ) : (

      // Both modes fill to the foot of the window and scroll inside themselves —
      // focus mode as two independent columns, the overview as one long table. One
      // shared scrollbar meant reading down a finding slid the list you navigate
      // with off the top of the screen.
      // **The divider is draggable, and the rail holds the width.** How much room the
      // list needs varies with what is in it — long check ids and wrapped titles want
      // a wide rail, reading a long analysis wants a narrow one — and one fixed width
      // was slightly wrong for both. The rail is the fixed pane so that stretching the
      // window widens the finding you are reading rather than the list you picked it
      // from.
      <div style={{
        display: 'flex',
        gap: selected ? 0 : 16,
        alignItems: 'stretch',
        ...PANE_FILL,
      }}
      >
        {selected ? null : (
          <div style={{
            flex: 1,
            // A flex item now, not a grid track: the default `min-width: auto` lets
            // the table inside push this wider than the pane and scroll the page
            // sideways, which a `minmax(0,1fr)` track never did.
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
          }}
          >
            {/* How far it got, in three words — and it does not offer to fix it.
                Running the rest is an expensive act that changes the case, and it
                already has a home: the primary button in the workbench header, where
                every other action lives and where nobody arrives by accident. A
                second trigger for it, styled as a link beside the findings somebody
                is reading, is a misclick waiting to happen — and it was. */}
            {run.stoppedAfterPlan ? (
              <Notice
                tone="warning"
                icon="shield-alert"
                title={`${plural(run.remaining, 'check')} not run`}
              />
            ) : null}
            <FindingsTable
              groups={groups}
              clean={visible.clean}
              callOf={callOf}
              docById={docById}
              onSelect={(id) => { onSelect(id); setTab('analysis') }}
              onPick={(id, a) => actions.override(id, a)}
            />
          </div>
        )}
        {selected ? (
        <div style={{ ...cardSurface(12), boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', flex: `0 0 ${railWidth}px`, width: railWidth }}>
          {/* Fixed head: the way back and the grouping. Both have to stay reachable
              while the list under them scrolls, and neither should move when you
              pick a different finding. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
            <button
              onClick={() => onSelect(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--me-blue)' }}
            >
              <Icon name="arrow-left" size={14} />
              All findings
            </button>
          </div>

          {/* The list, and the only thing in this column that scrolls. */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {groups.map((g) => (
              <div key={g.label}>
                {/* The same band the overview uses, so the list you clicked from and
                    the list you land in are recognisably one list. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <Chip size="sm" tone={g.tone ?? 'neutral'}>
                    {g.icon ? <Icon name={g.icon} size={11} /> : null}
                    {g.label}
                  </Chip>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{g.items.length}</span>
                </div>
                {g.items.map((f) => (
                  <RailRow
                    key={f.id}
                    finding={f}
                    subtitle={subtitleFor(f)}
                    selected={f.id === selected.id}
                    call={callOf(f)}
                    onSelect={() => { onSelect(f.id); setTab('analysis') }}
                  />
                ))}
              </div>
            ))}

            {visible.clean.length ? (
              <>
                <button
                  onClick={() => setShowClean((s) => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', background: 'var(--me-grey-08)', border: 'none', borderTop: '1px solid var(--me-grey-15)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, color: 'var(--me-grey-70)', textAlign: 'left' }}
                >
                  <Icon name={showClean ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
                  <span>{plural(visible.clean.length, 'area')} came back clean</span>
                </button>
                {showClean
                  ? visible.clean.map((f) => (
                    <RailRow
                      key={f.id}
                      finding={f}
                      subtitle={subtitleFor(f)}
                      selected={f.id === selected.id}
                      call={callOf(f)}
                      onSelect={() => { onSelect(f.id); setTab('analysis') }}
                    />
                  ))
                  : null}
              </>
            ) : null}
          </div>
        </div>
        ) : null}

        {selected ? <ResizeHandle width={railWidth} onResize={setRailWidth} side="left" min={232} max={520} reset={316} /> : null}

        {selected ? (
        // The finding's own scroller. `auto`, not the page's — reading to the bottom
        // of a long analysis must not take the list with it.
        <div style={{ ...cardSurface(12), boxShadow: '0 2px 8px rgba(27,28,30,.06)', overflowX: 'hidden', overflowY: 'auto', minHeight: 0, flex: 1, minWidth: 0, marginLeft: 7 }}>
          <div style={{ padding: '18px 22px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--me-grey-15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              {/* This side yields the space, because the area name can ellipsise and
                  the control cannot: squeezing a `nowrap` trigger does not shorten it,
                  it makes it overlap itself. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                <Eyebrow size="sm">{selected.area}</Eyebrow>
              </div>
              {/* The value is the control: what this will be raised as, and where you
                  change it. There is still no "Agree" — the outcome already stands,
                  and a control whose effect is that nothing changes is one people
                  learn to press without reading. */}
              <OutcomeSelect call={call} align="right" onPick={(a) => actions.override(selected.id, a)} />
            </div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3, color: 'var(--me-ink)', textWrap: 'pretty' }}>{selected.title}</h3>

            {/* The statement that would go out in the refusal advice. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Eyebrow size="sm" style={{ fontWeight: 400 }}>
                {call.value === 'CLEAN' ? 'Result Statement' : 'Discrepancy Statement'}
              </Eyebrow>
              <DiscrepancyStatement text={selected.statement} tone={sev.dot} />
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
              {selected.comparison ? <ConditionRows condition={selected.comparison} /> : null}
              <MarkdownDoc
                text={selected.analysisMarkdown}
                label={selected.comparison ? 'How it reads' : 'Finding'}
                meta={`${selected.checkId ?? 'no rule'} · ${selected.statementSource === 'derived' ? 'derived from the rule' : selected.statementSource === 'officer' ? 'raised by you' : 'model output'}`}
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

// One finding in the focus-mode rail.
//
// Two lines, always the same two, and — the point of it — **a height that does not
// depend on selection or on the call you have made.** The card that used to sit here
// let its title wrap freely and grew a decision label once you decided, so the list
// reflowed under the cursor: you would decide one finding and find the next one
// somewhere else. Selection is a wash and a left edge; a decision is a tick in a
// slot that is there whether it holds one or not.
//
// Deciding happens in the detail header, which is why there are no disposition chips
// here. The rail navigates; the pane beside it is where the call is made.
function RailRow({ finding, subtitle, selected, call, onSelect }) {
  const mark = kindMark(kindOf(finding))
  return (
    <button
      data-rail-id={finding.id}
      onClick={onSelect}
      title={finding.title}
      style={{
        display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left',
        padding: '8px 12px 8px 9px', border: 'none', borderBottom: '1px solid var(--me-grey-08)',
        borderLeft: `3px solid ${selected ? 'var(--me-blue)' : 'transparent'}`,
        background: selected ? 'var(--surface-blue-wash)' : '#fff',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <OutcomeMark outcome={call.value} size={12} />
        {finding.gap ? (
          <span title="No check on the plan covers this — a gap to close in Governance" style={{ display: 'flex', flexShrink: 0, color: '#946400' }}><Icon name="circle-alert" size={11} color="currentColor" /></span>
        ) : (
          <span title={mark.title} style={{ display: 'flex', flexShrink: 0, color: mark.color }}><Icon name={mark.icon} size={11} color="currentColor" /></span>
        )}
        <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: finding.checkId || finding.raisedByOfficer ? 'var(--me-grey-70)' : '#946400' }}>
          {finding.checkId ?? (finding.raisedByOfficer ? 'yours' : 'no rule')}
        </span>
        <TierTag tier={finding.settledBy} checkType={finding.checkType} overridden={call.overridden} size="dot" />
        {/* Always rendered, so an override does not change the row's width or height.
            Initials rather than a tick: two characters that say *who*, which a tick
            cannot, and which a refusal advice has to be able to state. */}
        <span style={{ flex: '0 0 20px', display: 'flex', justifyContent: 'flex-end', fontSize: 9.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--me-grey-70)' }}>
          {call.overridden ? initialsOf(call.by) : null}
        </span>
      </span>
      {/* Not bolder when selected: a heavier line can wrap where the lighter one
          did not, which is the row growing by a line under the cursor again. */}
      <span style={{ ...clampLines(2), fontSize: 12.5, lineHeight: 1.35, color: 'var(--me-ink)' }}>
        {finding.title}
      </span>
      <span style={{ ...ellipsis, fontSize: 10.5, color: 'var(--me-grey-70)' }}>{subtitle}</span>
    </button>
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
// about the list rather than about any one item.
//
// One column, one question — the same discipline the plan screen uses, and for the
// same reason it needed it. Column two used to be 96px holding four things at once:
// a gap marker, the check id, how it was settled, and a "not settled" note. Nothing
// fitted, so every one of them ellipsised to nothing and the column read as empty.
//
// `Settled by` and `Outcome` are in the same words and the same order as the plan,
// so a finding is described the same way on both screens. `Cited as` came off to
// make the room: it is on the detail pane one click away, and while triaging a list
// the question is what was found, not which article to quote.
//
// **Six columns became five.** `Your call` held "Agreed / Not one / Needs you" — a
// second vocabulary for a fact `Outcome` now states in its own words, and the source
// of the one thing an officer could not do here: tell at a glance whether a row read
// that way because a person said so or because nobody had touched it. The override
// lives in the outcome cell now, as the officer's initials, which answers that and
// says who as well.
const FCOLS = {
  display: 'grid',
  // The outcome track holds a mark, a word, a chevron and — where somebody
  // overruled the engine — their initials. Sized for the longest of them
  // ("Discrepant", overridden) so the chevron never ends up the thing that clips:
  // a control whose affordance is the first casualty of a narrow column is one
  // nobody discovers.
  gridTemplateColumns: '122px 104px 152px minmax(0,1.6fr) minmax(0,0.95fr)',
  gap: 14,
  alignItems: 'center',
}



function FindingsTable({ groups, clean, callOf, docById, onSelect, onPick }) {
  const [showClean, setShowClean] = useState(false)
  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ ...FCOLS, padding: '9px 16px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
        <Eyebrow size="sm">Check</Eyebrow>
        <Eyebrow size="sm">Settled by</Eyebrow>
        <Eyebrow size="sm">Outcome</Eyebrow>
        <Eyebrow size="sm">Finding</Eyebrow>
        <Eyebrow size="sm">On</Eyebrow>
      </div>

      {/* The rows, and the only thing here that scrolls. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {groups.map((g) => (
        <div key={g.label}>
          <KindGroupHeader group={g} count={g.items.length} />
          {g.items.map((f) => (
            <FindingRow key={f.id} finding={f} call={callOf(f)} docById={docById} onSelect={() => onSelect(f.id)} onPick={(a) => onPick(f.id, a)} />
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
            ? clean.map((f) => <FindingRow key={f.id} finding={f} call={callOf(f)} docById={docById} onSelect={() => onSelect(f.id)} onPick={(a) => onPick(f.id, a)} />)
            : null}
        </div>
      ) : null}
      </div>
    </div>
  )
}

// A div rather than a button, and not by preference: the Outcome cell is a menu
// trigger now, and a button inside a button is invalid HTML that browsers resolve by
// dropping one of them — the row would swallow the menu's clicks. `role="button"`
// plus the two keys a button answers to gets the behaviour back honestly.
function FindingRow({ finding, call, docById, onSelect, onPick }) {
  const mark = kindMark(kindOf(finding))
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
      }}
      title={finding.title}
      style={{ ...FCOLS, width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--me-grey-08)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {/* The gap mark wins over the kind mark: that a card could not settle it,
            or that no card covers it, is the more urgent thing about the row. */}
        {finding.gap ? (
          <span title="No check on the plan covers this — a gap to close in Governance" style={{ display: 'flex', flexShrink: 0, color: '#946400' }}><Icon name="circle-alert" size={11} color="currentColor" /></span>
        ) : (
          <span title={mark.title} style={{ display: 'flex', flexShrink: 0, color: mark.color }}>
            <Icon name={mark.icon} size={11} color="currentColor" />
          </span>
        )}
        <span style={{ ...ellipsis, fontFamily: 'var(--font-mono)', fontSize: 11, color: finding.checkId ? 'var(--me-grey-70)' : finding.raisedByOfficer ? 'var(--me-grey-70)' : '#946400' }}>
          {finding.checkId ?? (finding.raisedByOfficer ? 'yours' : 'no rule')}
        </span>
      </span>

      {/* How it was settled, in the same words the plan uses. It shared the Check
          cell until it grew from "exact" to "Comparison" and pushed the id out. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <TierTag tier={finding.settledBy} checkType={finding.checkType} overridden={call.overridden} />
      </span>

      {/* What came of it, whose call it now is, and where you change it — the value
          and the control are one thing. Changing a row from the list means never
          having to open it just to correct a tag you got wrong. */}
      <OutcomeSelect call={call} onPick={onPick} />

      <span style={{ ...ellipsis, fontSize: 12.5, color: 'var(--me-ink)' }}>{finding.title}</span>

      <span style={{ ...ellipsis, fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        {docById[finding.docId]?.docType ?? finding.quoteSource ?? '—'}
      </span>
    </div>
  )
}

