import { cardSurface } from '@shared/ds/Card'
import { ellipsis } from '@shared/ds/text'
import { useState, useMemo } from 'react'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import { toneOf } from '@shared/lib/tone'
import { plural } from '@shared/lib/format'
import DiscrepancyStatement from '../components/DiscrepancyStatement'
import { OutcomeMark } from '../components/OutcomeCell'
import OutcomeSelect from '../components/OutcomeSelect'
import { outcomeMeta, CASE_STATUS, tally } from '../state/outcome'
import { settledBy, bySettledBy } from '../data/checkSpecs'
import { groupByKind, kindOf, kindMark } from '../state/findingKinds'
import KindGroupHeader from '../components/KindGroupHeader'
import Notice from '@shared/ds/Notice'
import TierTag from '../components/TierTag'
import { PANE_FILL } from '../components/paneHeight'
import { useCase } from '../state/CaseContext'

// Stage 5 — the officer's decision.
//
// The engine has no vote here. Every finding needing a call is listed with the
// check that produced it, the statement that would go out in the advice, and what
// it will be raised as. The status, the note and the signature are theirs.
//
// **A call can be made here as well as in Review**, with the same control and the
// same two values — Clear it, or Call it discrepant. Both screens write through
// `actions.override`, so there is one write path and no way for the two to hold
// different answers; what differs is what is in front of you when you decide. Review
// has the document pane and the credit anchor and is where a disputed reading gets
// settled; this screen has the whole list and the advice about to go out, and the
// call you make here is usually the one you already reached — a row you meant to
// clear and want to clear now that you can see the notice it would appear on. Sending
// somebody back a tab for that is a rule with nothing behind it, so the expanded row
// still links to Review for the evidence.
//
// What this screen owns alone is the act Review cannot make: where the presentation
// lands.
//
// Rows collapse because this list is read twice for different reasons: once
// scanning for what is unresolved, once reading a specific finding in full. A
// list that is always expanded serves the second and defeats the first.
// What a finding is cited against, in the words a notice uses.
const CITE = { credit: 'the credit', practice: 'UCP / ISBP', policy: 'bank policy' }

export default function DecisionScreen({ onOpenFinding }) {
  const { data, run, visible, officer, callOf, status, actions } = useCase()
  const [expanded, setExpanded] = useState({})

  const checkById = useMemo(() => Object.fromEntries(data.checks.map((c) => [c.id, c])), [data.checks])
  const docById = useMemo(() => Object.fromEntries(data.documents.map((d) => [d.id, d])), [data.documents])

  // A refusal notice under UCP 600 art. 16(c) states *discrepancies* — ways the
  // presentation fails to comply with the credit and the rules applied to it. A hold
  // that cites internal policy is not one of those: the documents may comply
  // perfectly and the bank still will not pay yet. It stops the payment through a
  // different door, and stating it to the presenting bank as a discrepancy would be
  // wrong on the face of the notice.
  //
  // So the two are separated here rather than listed together. Everything else keeps
  // Review's vocabulary — how it was settled, what it is cited against — because the
  // officer arrives from Review and should not have to relearn the list.
  const all = visible.attention
  const rows = all.filter((f) => (f.source ?? 'credit') !== 'policy')
  const holds = all.filter((f) => f.source === 'policy')

  // Grouped by kind, exactly as Review groups them, from the same definition. The
  // officer worked the findings list by these three headings; arriving at the
  // decision to find one flat list means re-finding everything they just read.
  //
  // **And sorted the same way inside each group** — by who settled it: comparison,
  // then agent, then manual, from `checkSpecs`. This list had no order at all, so it
  // came out in whatever sequence the service returned, and the officer who had just
  // worked the plan and then the findings in one sequence met a third arrangement on
  // the screen where they sign. It also front-loads the cheap reading: a comparison
  // is a sum you check in seconds, so most of the list clears before the prose starts.
  const groups = useMemo(() => {
    // An override makes a person the one who settled it, so it sorts as manual — the
    // same rule the tag on the row states. Your own calls collect at the foot of their
    // group, which is where you look to see what you have actually touched.
    const order = bySettledBy((f) => (
      callOf(f).overridden ? 'manual'
        : f.checkId && checkById[f.checkId] ? settledBy(checkById[f.checkId]) : 'agent'))
    return groupByKind(rows, order)
  }, [rows, checkById, callOf])

  const allExpanded = rows.length > 0 && rows.every((f) => expanded[f.id])

  const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }))
  const setAll = (on) => setExpanded(on ? Object.fromEntries(rows.map((f) => [f.id, true])) : {})

  // Checks that were planned and never reached. Not the ones this credit never
  // triggered or the planner stood down — those are answers, and the planner cannot
  // stand a rule down without raising a card for it.
  const unrun = (data.checks ?? []).filter((c) => !c.findingId && !c.notCovered && c.areaId && !c.suppressedBecause)

  // The four counts, and deliberately no fifth. There is no "still open" any more:
  // every finding carries an outcome from the moment it runs, so there is nothing
  // left to be open. What used to sit in that slot — an undecided count the officer
  // was implicitly asked to drive to zero — is exactly the pressure that turns a
  // review into a click-through. What is unresolved says DOUBT and routes the case
  // to further check, which is an answer rather than a chore.
  const counts = tally(visible.findings, officer.overrides, unrun.length)

  return (
    // The findings scroll; the decision does not.
    //
    // The right column is where the officer signs: the verdict, the note, the submit.
    // Those are not a list to work through — they are one act, and they should be
    // under the hand whichever finding is on screen. So the left column is the only
    // scroller here, and the panel stays put beside it.
    <section className="helix-screen" style={{ padding: '18px 32px 16px', display: 'grid', gridTemplateColumns: 'minmax(360px,1fr) minmax(320px,400px)', gap: 16, alignItems: 'stretch', ...PANE_FILL }}>
      {/* The column does not scroll — the findings card inside it does. Scrolling the
          whole strip took the header, the tally and the policy holds off the top with
          it, so an officer working down a long list lost the counts they were working
          against and the hold they were supposed to be mindful of. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Held, not refused. A sanctions or policy hold stops the payment without
          being a discrepancy: the documents may comply perfectly. It cannot be
          stated to the presenting bank under art. 16(c), so it is above the
          dispositions rather than in them, where nobody can mistake it for one. */}
      {holds.length ? (
        <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', borderColor: '#E9C97A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: '#FBEFCF', borderBottom: '1px solid var(--me-grey-15)' }}>
            <Icon name="shield-alert" size={15} color="#946400" />
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#946400' }}>
              {holds.length === 1 ? 'A policy hold stops this payment' : `${holds.length} policy holds stop this payment`}
            </span>
          </div>
          <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {holds.map((f) => (
              <button key={f.id} onClick={() => onOpenFinding(f.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Icon name="dot" size={14} color="#946400" />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--me-ink)' }}>{f.title}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)' }}>{f.checkId}</span>
                </span>
              </button>
            ))}
            <span style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--me-grey-70)' }}>
              Not a discrepancy, and not stated on the advice — the presentation may comply in
              every respect and still be held here. Escalate it through financial crime; the
              refusal notice below covers the credit and the rules only.
            </span>
          </div>
        </div>
      ) : null}

      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--me-grey-15)', minHeight: 56, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Findings</span>
            {rows.length ? (
              <button
                onClick={() => setAll(!allExpanded)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5, width: 96, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--me-blue)' }}
              >
                <Icon name={allExpanded ? 'chevrons-down-up' : 'chevrons-up-down'} size={13} />
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            ) : null}
          </div>
          {/* The tally reads in the outcome's own words and its own marks — no washes
              behind it. A pill per count put four filled shapes on a header whose job
              is to be read past, and the two that matter are already the only ones
              carrying hue. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {counts.map((t) => (
              <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
                <OutcomeMark outcome={t.key} size={12} />
                <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--me-ink)' }}>{t.n}</span>
                <span>{t.label.toLowerCase()}</span>
              </span>
            ))}
          </div>
        </div>

        {/* How far it got. It states and does not act: running the rest belongs to
            the workbench's primary button, not to a link on the screen where the
            officer is deciding. */}
        {run.stoppedAfterPlan ? (
          <div style={{ padding: '12px 18px 0' }}>
            <Notice
              tone="warning"
              icon="shield-alert"
              title={`${plural(run.remaining, 'check')} not run`}
            />
          </div>
        ) : null}

        {/* The rows, and the only thing in the card that scrolls — the same shape
            Review's findings table uses, so the two lists behave alike. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '28px 18px', fontSize: 13, color: 'var(--me-grey-70)' }}>
            Nothing needs a decision yet — run the review first.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {/* The same band the plan and the report use — one component, so the
                  four groups cannot be labelled or coloured differently here. */}
              <KindGroupHeader group={g} count={g.items.length} />
              {g.items.map((f) => {
            const call = callOf(f)
            const sev = outcomeMeta(call.value)
            const isOpen = !!expanded[f.id]
            const check = f.checkId ? checkById[f.checkId] : null
            const mark = kindMark(kindOf(f))

            return (
              <div key={f.id} style={{ borderBottom: '1px solid var(--me-grey-08)' }}>
                {/* Two lines, and only two: reference and citation on the first,
                    the finding itself on the second. This list is worked all the way
                    down, so every line a row spends on itself is a row fewer on the
                    screen — the marks that were on a third line now sit inline on the
                    first, which is where the eye already is. */}
                {/* A grid, not a flex. The outcome is the tail of a row whose content
                    is variable width, so it would sit at a different x on every line —
                    you could not run your eye down the column and see where the case
                    stands, which is the one thing this screen is for. Pinned to a
                    track, the outcomes read as a column. */}
                <div style={{ display: 'grid', gridTemplateColumns: '15px minmax(0,1fr) auto', alignItems: 'center', gap: 10, padding: '7px 18px' }}>
                  <button
                    onClick={() => toggle(f.id)}
                    aria-expanded={isOpen}
                    title={isOpen ? 'Collapse' : 'Expand'}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', marginTop: 2, color: 'var(--me-grey-50)' }}
                  >
                    <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={15} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      {/* Where the card came from — the same mark Review uses, from
                          the same definition. An icon rather than the line of prose
                          it used to have: the group heading already spells it out. */}
                      <span title={mark.title} style={{ display: 'flex', flexShrink: 0, color: mark.color }}>
                        <Icon name={mark.icon} size={11} color="currentColor" />
                      </span>
                      {/* Check reference: the unique handle for this finding, and
                          what gets quoted in the advice and the file. Where there is
                          none, Review's two words for why — a card nobody authored,
                          or a finding that was never a check's. */}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: f.checkId || f.raisedByOfficer ? 'var(--me-grey-70)' : '#946400', whiteSpace: 'nowrap' }}>
                        {f.checkId ?? (f.raisedByOfficer ? 'yours' : 'no card')}
                      </span>
                      {/* Not the area name for an officer's finding — that reads
                          "Raised by you" directly under a heading already saying so.
                          The document is the useful thing to know instead. */}
                      <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', minWidth: 0, ...ellipsis }}>
                        {check?.name ?? docById[f.docId]?.docType ?? f.area}
                      </span>
                      {/* How it was settled. On this screen it decides whether the
                          statement can go out as written or has to be read first. */}
                      <TierTag tier={f.settledBy} checkType={f.checkType} overridden={call.overridden} />
                      {/* What it is cited against, which decides whether it can go on
                          a refusal advice at all. */}
                      {CITE[f.source] ? (
                        <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          · {CITE[f.source]}
                        </span>
                      ) : null}
                    </div>
                    <span
                      onClick={() => toggle(f.id)}
                      style={{ fontSize: 13, color: 'var(--me-ink)', lineHeight: 1.4, cursor: 'pointer', ...(isOpen ? {} : { ...ellipsis }) }}
                    >
                      {f.title}
                    </span>
                  </div>

                  {/* What it will be raised as, with the seam in full where a person
                      overruled the engine. There is room for it here — this is the
                      last screen before the advice goes out, and "the model called
                      this discrepant and somebody cleared it" is precisely what a
                      checker reading over the officer's shoulder needs to see.
                      Nothing here is clickable: the call is made in Review, where the
                      evidence is, and the row below links back to it. */}
                  {/* One track, centred on the row rather than pinned to its top.
                      It was a value and a button cluster on two separately nudged
                      baselines, which is why neither lined up with the title beside
                      them or with the rows above and below. The value *is* the
                      control now, so there is one thing to align and it sits on the
                      row's own centre line. */}
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <OutcomeSelect call={call} align="right" onPick={(a) => actions.override(f.id, a)} />
                  </span>
                </div>

                {isOpen ? (
                  // Recessed, so an open row reads as a nested panel instead of
                  // blending into the rows above and below it.
                  <div style={{ margin: '0 18px 12px 43px', padding: '12px 14px', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <DiscrepancyStatement text={f.statement} tone={sev.accent} compact onSurface />
                    {/* Where the wording came from. A statement derived from a rule's
                        own Raise line plus the real values is exact and reproducible;
                        one an agent drafted is prose that has to be read before it
                        goes out over the bank's name. Saying which tells the officer
                        where to spend their attention. */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: f.statementSource === 'derived' ? 'var(--me-grey-70)' : '#946400' }}>
                      <Icon name={f.statementSource === 'derived' ? 'circle-check' : 'pencil'} size={12} color="currentColor" />
                      {f.statementSource === 'derived'
                        ? 'Derived from the rule and the values it read — exact as written.'
                        : f.statementSource === 'officer'
                          ? 'Your wording.'
                          : 'Drafted by the agent — read it before it goes out.'}
                    </span>
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey)' }}>{f.analysis.why}</p>
                    {f.analysis.options?.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {f.analysis.options.map((o, i) => (
                          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--me-grey)' }}>{o}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      onClick={() => onOpenFinding(f.id)}
                      style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                      Open the full finding →
                    </button>
                  </div>
                ) : null}
              </div>
            )
              })}
            </div>
          ))
        )}
        </div>
      </div>
      </div>

      {/* Sign-off. Does not scroll with the findings — but does give way if the
          window is genuinely too short for it, rather than clipping the Submit
          button off the bottom. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ ...cardSurface(12), boxShadow: 'none', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Button onClick={actions.submit} disabled={officer.submitted}>{officer.submitted ? 'Submitted' : 'Submit'}</Button>
            <Button variant="secondary" size="sm" onClick={() => actions.flash('Findings exported as Excel.')}>Export to Excel</Button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--me-grey-70)' }}>To {data.authoriser}</span>
          </div>

          {/* Where the presentation lands. Derived from the outcomes and marked as
              derived, so the officer can see the arithmetic they are agreeing with —
              and can disagree, which is the same two slots a finding has, one level
              up. The old three options were `refuse | waiver | second look`: two
              outcomes and an action, mixed on one axis, none of them computed from
              anything. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6, borderTop: '1px solid var(--me-grey-08)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--me-grey-70)', paddingBottom: 4 }}>This presentation is</span>
            {Object.entries(CASE_STATUS).map(([key, s]) => {
              const on = status.value === key
              return (
                <button
                  key={key}
                  onClick={() => actions.dispatch({ type: 'case_status', status: key })}
                  title={s.consequence}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 2px', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}
                >
                  <span style={{ width: 15, height: 15, flex: '0 0 15px', borderRadius: 999, border: `1.5px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-50)'}`, background: on ? 'var(--me-blue)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <span style={{ width: 5, height: 5, borderRadius: 999, background: '#fff' }} /> : null}
                  </span>
                  <span style={{ fontSize: 13.5, color: 'var(--me-ink)', fontWeight: on ? 600 : 400 }}>{s.label}</span>
                  {/* Only on the computed one, and only while it is still the
                      computed one — once somebody has chosen, the mark would be
                      claiming the machine agreed with them. */}
                  {key === status.derived && !status.chosen ? (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>derived</span>
                  ) : null}
                </button>
              )
            })}
            <p style={{ margin: '8px 0 0', paddingTop: 10, borderTop: '1px solid var(--me-grey-08)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--me-grey)' }}>
              {CASE_STATUS[status.value].consequence}
            </p>
            {/* Take-up-subject-to-waiver is a real outcome and it is not a fourth
                status: it does not change what was found, it changes what the bank
                does about it. So it is an act under Discrepant rather than a value
                that would let the status misdescribe the examination. */}
            {status.value === 'DISCREPANT' ? (
              <button
                onClick={() => actions.flash('Waiver request drafted — the applicant is asked to waive the discrepancies.')}
                style={{ alignSelf: 'flex-start', marginTop: 8, fontSize: 12, color: 'var(--me-blue-deep)', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid var(--me-blue-20)', padding: 0, fontFamily: 'inherit' }}
              >
                Seek a waiver instead
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--me-grey-08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>Review Note</span>
              <span
                title="Notes you left on individual findings are collected here. Edit or add anything else in your own words — it travels with the case."
                style={{ display: 'flex', color: 'var(--me-grey-70)', cursor: 'help' }}
              >
                <Icon name="help-circle" size={14} />
              </span>
            </div>
            <textarea
              value={officer.reviewNote}
              onChange={(e) => actions.dispatch({ type: 'review_note', text: e.target.value })}
              placeholder="Your note on this review"
              style={{ width: '100%', minHeight: 132, resize: 'vertical', border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '11px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ ...cardSurface(12), boxShadow: 'none', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>Routing</span>
          {[
            { icon: 'user-check', color: 'var(--me-blue)', text: 'You are the maker of record', sub: 'The AI pre-check does not sign anything' },
            { icon: 'arrow-right', color: 'var(--me-blue)', text: `Checker: ${data.authoriser}`, sub: 'Amount over USD 1m — a senior checker must confirm' },
            { icon: 'alert-triangle', color: 'var(--status-warning)', text: `${plural(visible.doubt.length, 'item')} nothing settled`, sub: 'Passed to the checker as open questions' },
          ].map((r) => (
            <div key={r.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', marginTop: 2 }}><Icon name={r.icon} size={14} color={r.color} /></span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12.5, color: 'var(--me-ink)', lineHeight: 1.4 }}>{r.text}</span>
                <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{r.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
