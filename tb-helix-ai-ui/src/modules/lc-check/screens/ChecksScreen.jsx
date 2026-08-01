import { useMemo, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Icon from '@shared/ds/Icon'
import Eyebrow from '@shared/ds/Eyebrow'
import Spinner from '@shared/ds/Spinner'
import { ellipsis } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
import { SETTLED_BY, settledBy, bySettledBy, sortPlanChecks } from '../data/checkSpecs'
import OutcomeCell from '../components/OutcomeCell'
import { kindGroup, kindOfCheck } from '../state/findingKinds'
import { useRailNav } from '../state/useRailNav'
import CheckSpecCard from '../components/CheckSpecCard'
import KindGroupHeader from '../components/KindGroupHeader'
import ResizeHandle from '@shared/ds/ResizeHandle'
import { PANE_FILL } from '../components/paneHeight'
import { useCase } from '../state/CaseContext'

// Stage 3 — the plan, and it running.
//
// The plan is a real artefact, not a progress bar with labels: every check the
// credit brings into play is listed before anything executes, and each carries the
// condition it will apply. Checks the credit does NOT trigger are listed too, with
// the reason — "we did not check that" must never be discovered after signing.
//
// ---------------------------------------------------------------------------
// Three groups, by PROVENANCE — who can answer for the check.
//
//   Gate         settled on the credit and the presentation record alone, before a
//                page is read
//   Rule         from the dictionary: standing, approved, the same on every credit
//   Requirement  read out of this credit's own 46A and 47A during the run, and
//                reviewed by nobody
//
// Not tabs. The plan's whole value is that it can be read down in one pass — split
// it three ways and "what does this credit require of me" stops being answerable in
// one look, which is the question asked in a dispute years later. Three tabs over
// 1 / 15 / 7 rows would also mean a click to see a single gate row. The plan
// two-stage indicator at the top says where the examination is; the groups fold, so
// the one being read gets the pane whole.
//
// ---------------------------------------------------------------------------
// Two axes, one column each — see `data/checkSpecs`.
//
//   Settled by  Comparison · Agent · Manual. Known when the check is planned and
//               unchanged afterwards, which is why it is worth reading *before* the
//               run: it is the answer to "how much of this is mine".
//   Outcome     what came of it, empty until it has been settled.
//
// These replaced one "State" column holding nine values across four questions —
// lifecycle, outcome, readiness and ownership at once. Nine values that do not
// answer one question read as placeholder text, which is exactly how they read.
//
// The same two words appear in Governance when an author picks a check type, and on
// the finding in Review. One vocabulary, three screens.
//
// ---------------------------------------------------------------------------
// What this screen is for after the run, and why it is not the review screen.
//
// A check is not a finding. One check can produce none, one or several findings, and
// a finding can exist with no check behind it at all. So the two screens are views of
// different things and both have to exist:
//
//   here    COVERAGE, and it is complete — every check, including the ones that
//           passed, the ones nothing could answer and the ones this credit never
//           brought into play. The only screen that answers "did you check X?"
//   review  DECISIONS, and it is selective. Only what needs a person, worst first,
//           each with its evidence and the officer's call.
//
// So this screen does not grow disposition buttons. Three of them on twenty-three
// rows, most of which need nothing, would invite an officer to work top-to-bottom
// through a list that is mostly noise — which is the failure the review screen's
// ordering exists to prevent. When the run finishes this screen states its coverage
// and hands over.
//
// ---------------------------------------------------------------------------
// The list changes shape according to whether it is the subject or the navigation:
//
//   nothing selected  the plan *is* the subject. Full width, one line per check,
//                     rows comparable down a column.
//   one selected      the plan becomes navigation. It shrinks to a rail and the
//                     check gets the room, because now the question is about that
//                     check and the answer is long.
//
// Clicking a row is the whole gesture, so a separate mode switch would be a second
// control for one intent. Closing the panel gives the overview back.
// ---------------------------------------------------------------------------
// Five columns, and each answers a different question. It was six, and two of them
// answered the same one: a leading status icon that restated the state column, and a
// tier dot that restated how the check is settled.
//
//   ID          what you cite, and what you search Governance by
//   Settled by  who gives the answer: a comparison, an agent, or the examiner
//   Outcome     what came of it
//   Check       what it is
//   Reads       which documents it looks at — the thing that varies meaningfully
//               down twenty-three rows and that an examiner already thinks in
//
// The two that decide anything sit together on the left, immediately after the id.
// They were on the right, at the far edge of a variable-width name column, so
// reading "how much of this is mine" down twenty-three rows meant twenty-three
// jumps across the table. Fixed-width and adjacent, they read as one vertical band
// in a single pass; the prose columns go right, where ragged width costs nothing.
//
// `Reads` used to print the whole operand expression — `expiry_date @ LC d_lte
// presentation_date @ CS`. Honest, and unscannable at sixty characters a row. The
// expression is in the detail pane, under Conditions, where there is room to read it.
const COLS = {
  display: 'grid',
  gridTemplateColumns: '92px 108px 104px minmax(0,1.6fr) minmax(0,0.85fr)',
  gap: 14,
  alignItems: 'center',
}

export default function ChecksScreen({ onOpenFinding }) {
  const { data, run, officer, actions } = useCase()
  const allChecks = useMemo(() => [...data.checks, ...officer.addedChecks], [data.checks, officer.addedChecks])
  const [selectedId, setSelectedId] = useState(null)
  const [showSkipped, setShowSkipped] = useState(false)
  // How wide the plan sits when a check is open. Kept on the screen rather than per
  // check, so picking a different row does not undo the width you just set.
  const [railWidth, setRailWidth] = useState(340)
  // Folded groups, by key. Empty means everything open, which is what a plan should
  // be the first time it is read — folding is for coming back to it.
  const [collapsed, setCollapsed] = useState({})

  const executing = run.activeStage === 'execute' || run.done.includes('execute')
  const planned = run.done.includes('plan')

  /** Whether this check has been settled yet — the precondition for having an outcome. */
  const settled = (check) => {
    if (check.suppressedBecause || !check.areaId) return true
    // A gate runs *with* the plan, not with the run. Waiting for
    // `executing` to call it settled left the one check that had already answered
    // showing "planned" beside its own discrepancy.
    if (check.gate) return planned
    if (run.stoppedAfterPlan) return true      // settled as "not run", which is an answer
    if (!executing) return false
    // A comparison is arithmetic over fields already extracted: it settles in the
    // same tick the run starts, never queued behind an agent reading pages.
    if (check.tier === 'exact') return true
    return run.completedAreaIds.includes(check.areaId)
  }

  const findingFor = (check) =>
    check.findingId ? data.findings.find((f) => f.id === check.findingId) ?? null : null

  /**
   * What came of a check, as the outcome-and-reason pair every surface reads.
   *
   * The three ways a check can *not* have run are still kept apart, but as
   * *reasons* under one outcome rather than as three outcomes of their own. "This
   * credit never called for it", "this credit stood it down" and "the plan ended
   * before it got there" are three different things to have to explain, and an
   * examiner reading the list of what was not checked needs to know which — but
   * none of them is a different answer to "what came of this". They are all NOT_RUN.
   *
   * `running` is not an outcome either, and never was: it is where the check is in
   * its lifecycle, and printing it in the outcome column is what made that column
   * read as four questions at once. It comes back as `busy`, which the row renders
   * as a spinner instead.
   */
  const outcomeOf = (check) => {
    const at = (outcome, outcomeReason = null) => ({ outcome, outcomeReason })
    if (check.suppressedBecause) return at('NOT_RUN', 'SET_ASIDE')
    if (!check.areaId && !check.addedByOfficer) return at('NOT_RUN', 'TRIGGER_NOT_MET')
    if (!settled(check)) {
      return run.activeAreaId === check.areaId ? { outcome: null, outcomeReason: null, busy: true } : null
    }
    const finding = findingFor(check)
    if (finding) return at(finding.outcome, finding.outcomeReason)
    if (run.stoppedAfterPlan) return at('NOT_RUN', 'NOT_REACHED')
    const rd = check.ruleDef
    // An operand nothing extracted. A missing input is not evidence of compliance,
    // so this is doubt rather than a pass — the distinction the rule engine's third
    // outcome exists for.
    if (rd && !rd.ready) return at('DOUBT', 'UNANSWERABLE')
    return at('CLEAN')
  }

  // A rule this credit's own :47A: stood down. It kept its area — it was selected,
  // then set aside — so it would otherwise sit in the Rule group looking planned.
  // Shown there anyway, struck through and carrying the clause, because a rule that
  // vanished would be a rule nobody could ask about.
  const isSuppressed = (c) => !!c.suppressedBecause
  const runnable = allChecks.filter((c) => (c.areaId || c.addedByOfficer) && !isSuppressed(c))
  const suppressed = allChecks.filter(isSuppressed)
  // Grouped by where the card came from, not by how it is settled — see
  // `state/findingKinds`. The tier rides on the row instead.
  const gates = runnable.filter((c) => c.gate)
  // Grouped on `origin`, which is the service's own answer to "who can answer for
  // this" — the same field `state/findingKinds` groups findings by, so the plan and
  // the report cannot disagree about what kind of thing a row is.
  //
  // It was `plannedByLlm`, a proxy, and the proxy was broken: the column is written
  // on every requirement card and was never read back, so everything arrived
  // claiming the dictionary wrote it and the whole plan filed under Rule. Grouping
  // on the real field means a bug in one boolean can no longer move a card between
  // provenances.
  //
  // A set-aside card stays in the group it came from. Standing a rule down does not
  // change who wrote it.
  // Three provenances plus the gate group, exactly the three
  // `state/findingKinds` uses — so a card is under the same heading on the plan, in
  // Review and on the Decision, which is what stops the list an officer worked
  // through from being a different list when they sign it.
  const isRule = (c) => kindOfCheck(c) === 'rule'
  const isRequirement = (c) => kindOfCheck(c) === 'requirement'
  const isOfficer = (c) => kindOfCheck(c) === 'officer'
  // Sorted exact-before-judged and then by concern. Catalogue order is the order
  // somebody happened to author them in, which reads as no order at all across
  // twenty rows.
  const fromDictionary = sortPlanChecks([...runnable.filter(isRule), ...suppressed.filter(isRule)])
  const dictExact = fromDictionary.filter((c) => c.tier === 'exact')
  const dictJudged = fromDictionary.filter((c) => c.tier !== 'exact')
  const fromCredit = [...runnable.filter(isRequirement), ...suppressed.filter(isRequirement)]
  const fromOfficer = [...runnable.filter(isOfficer), ...suppressed.filter(isOfficer)]
  const skipped = allChecks.filter((c) => !c.areaId && !c.addedByOfficer && !isSuppressed(c))

  // Every gate that came back discrepant, not just the first. A refusal
  // notice states each ground it stands on (art. 16(c)), so a second one hidden
  // behind the first is a ground that cannot be added later.
  const gateFailures = gates.map(findingFor).filter((f) => f && f.outcome === 'DISCREPANT')

  const selected = selectedId ? allChecks.find((c) => c.id === selectedId) : null
  const pick = (id) => setSelectedId((cur) => (cur === id ? null : id))

  // No sub-grouping here any more. It split the requirements into "Comparison /
  // Agent / Manual" bands with a heading and a sentence each — the same axis the
  // Settled by column states on every row, so the heading was the column's own
  // content restated as chrome, in a layout that matched nothing else on the page.
  // Sorted by it instead: the same clustering, none of the furniture.
  // One definition, in `checkSpecs` — Review and Decision sort their findings by the
  // same order, so the three screens read as three views of one list.
  const byWhoSettles = bySettledBy(settledBy)

  // Requirements the planner read out of the credit and found nothing to test with.
  // Not a hidden category: they are on the plan, under "your judgement" — the plan's
  // job is to say so *before* the run rather than after.
  const notCoveredCount = fromCredit.filter((c) => settledBy(c) === 'manual').length

  // Whether anything is running at all — this tab's own flag OR the service's.
  //
  // The two answer different questions: `activeStage` is this tab saying it started
  // a stage, `busy` is the service saying one is running. A run this tab did not
  // personally start — a reload mid-plan, a second tab, every stage Auto chained —
  // only ever sets the second, and reading the first alone is what had the workbench
  // report a case that was actively planning as not started.
  const working = run.busy || !!run.activeStage

  // The two stages this screen covers, each in one of four states. Derived rather
  // than counted: "has the plan been made" and "have the checks run" are yes/no
  // questions, and answering them with a percentage was what made the header a
  // statistics panel instead of a status.
  const stageState = (id) => {
    if (run.activeStage === id) return 'running'
    if (run.done.includes(id)) return 'done'
    if (id === 'execute' && run.stoppedAfterPlan) return 'skipped'
    if (id === 'plan' && planned) return 'done'
    return 'pending'
  }
  // Grey until it is done. Three appearances, not four — "the plan decided not to
  // run this" is still a stage that has not run, and giving it amber made a stage
  // that did exactly what was decided look like a problem. The reason it did not run
  // is in the tooltip, and the officer's way to change it is the run button.
  const STATE_STYLE = {
    pending: { bg: 'var(--me-grey-08)', ink: 'var(--me-grey-50)', icon: 'circle-dashed' },
    skipped: { bg: 'var(--me-grey-08)', ink: 'var(--me-grey-50)', icon: 'minus' },
    running: { bg: 'var(--me-blue-20)', ink: 'var(--me-blue-deep)', icon: 'loader' },
    done: { bg: 'var(--me-green-20)', ink: '#1F7A00', icon: 'check' },
  }
  const STAGE_TIP = {
    pending: 'Not started.',
    running: 'Running now.',
    done: 'Done.',
    skipped: 'The plan decided this was not worth running. You can still run it.',
  }
  const stages = [
    { id: 'plan', label: 'Plan' },
    { id: 'execute', label: 'Execute' },
  ].map((st) => {
    const state = stageState(st.id)
    return { ...st, state, ...STATE_STYLE[state], tip: `${st.label} — ${STAGE_TIP[state]}` }
  })

  const sections = [
    {
      ...kindGroup('gate'),
      count: gates.length,
      checks: gates,
      // Each group's aside answers the question that group is asked, and nothing
      // else. It used to carry a token estimate, which answered a question the
      // examination does not turn on.
      aside: planned
        ? gateFailures.length
          ? { warn: true, text: `${plural(gateFailures.length, 'ground')} to refuse on` }
          : { text: 'nothing to report' }
        : null,
    },
    {
      ...kindGroup('rule'),
      count: fromDictionary.length,
      checks: fromDictionary,
      aside: suppressed.length
        ? { warn: true, text: `${plural(suppressed.length, 'rule')} set aside by this credit` }
        : { text: `${dictExact.length} by comparison · ${dictJudged.length} by agent` },
    },
    {
      ...kindGroup('requirement'),
      count: fromCredit.length,
      checks: fromCredit.slice().sort(byWhoSettles),
      aside: notCoveredCount
        ? { warn: true, text: `${notCoveredCount} for you to settle` }
        : { text: `${fromCredit.length} read from this credit` },
    },
    {
      ...kindGroup('officer'),
      count: fromOfficer.length,
      checks: fromOfficer,
    },
  ].filter((s) => s.count)

  // Visible rail order while a check is open — folded groups and a closed
  // skipped band stay out, so ↑↓ match what is on screen.
  const railIds = useMemo(() => {
    const out = []
    for (const sec of sections) {
      if (collapsed[sec.key]) continue
      for (const c of sec.checks) out.push(c.id)
    }
    if (showSkipped) for (const c of skipped) out.push(c.id)
    return out
  }, [sections, collapsed, showSkipped, skipped])

  useRailNav({
    ids: railIds,
    selectedId,
    onSelect: setSelectedId,
    onClear: () => setSelectedId(null),
  })

  return (
    <section
      className="helix-screen"
      style={{ padding: '16px 24px 16px', display: 'flex', flexDirection: 'column', gap: 12, ...PANE_FILL }}
    >
      {/* ------------------------------------------------------------------
          Where this examination is — above both panes, full width, always.

          It belongs to the *screen*, not to the list: "has the plan been made,
          have the checks run" is the same question whether you are reading the
          whole plan or one check out of it. It lived inside the list card, so
          opening a check either squeezed it into a 300px rail or — worse, which
          is what happened — hid it exactly when the officer had drilled in and
          most wanted to know what was still running.
          ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Check plan</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          {stages.map((st, i) => (
            <span key={st.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 ? <span style={{ width: 14, height: 2, background: 'var(--me-grey-15)' }} /> : null}
              <span
                title={st.tip}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 999,
                  background: st.bg, color: st.ink,
                  fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                {st.state === 'running' ? <Spinner /> : <Icon name={st.icon} size={12} color="currentColor" />}
                {st.label}
              </span>
            </span>
          ))}
        </span>
        {/* Which step, and how far through — then what it is doing, in the service's
            own words. The step first because it is the part that keeps moving: the
            activity line can sit unchanged for seventeen seconds while `govern`
            thinks, and a line that does not change is indistinguishable from a
            stall. */}
        {working && run.step ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--me-blue-deep)' }}>
            <Spinner size={11} />
            {run.step.key}
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--me-grey-70)' }}>
              {run.step.index}/{run.step.total}
            </span>
          </span>
        ) : null}
        {working && run.activity ? (
          <span style={{ ...ellipsis, fontSize: 11.5, color: 'var(--me-grey-70)', minWidth: 0 }}>{run.activity}</span>
        ) : null}
        <div style={{ flex: 1 }} />
        {!executing && !run.stoppedAfterPlan ? (
          <button onClick={actions.addCheck} title="Add a check the credit does not call for — it runs with the rest and is recorded against your name" style={linkBtn}>
            <Icon name="plus" size={14} />
            Add a check
          </button>
        ) : null}
      </div>

      {/* Both panes reach the foot of the window and scroll themselves. The plan is
          long and the selected check is long; on one page scroll, reading either moved
          the other.

          **The divider is draggable, and the rail is the pane that holds its width.**
          How much room the plan needs is not a constant: twenty-three rows of
          `expiry_date @ LC` want a wide rail, and reading one agent's execution plan
          wants a narrow one. Fixing it at 340px made both cases slightly wrong. The
          rail holds the width so that stretching the window widens the check you are
          reading rather than the list you picked it from. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: selected ? 0 : 16,
          flex: 1,
          minHeight: 0,
        }}
      >
      <div style={{
        ...cardSurface(12),
        boxShadow: 'none',
        overflow: 'hidden',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...(selected ? { flex: `0 0 ${railWidth}px`, width: railWidth } : { flex: 1 }),
      }}>
        {/* Only the way back. Everything that was on this row — the stages, the
            activity, "Add a check" — is above both panes now, where it is visible
            whether or not a check is open. */}
        {selected ? (
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
            <button
              onClick={() => setSelectedId(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--me-blue)' }}
            >
              <Icon name="arrow-left" size={14} />
              All checks
            </button>
          </div>
        ) : null}

        {!selected && (
          <div style={{ ...COLS, padding: '9px 16px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
            <Eyebrow size="sm">ID</Eyebrow>
            <Eyebrow size="sm">Settled by</Eyebrow>
            <Eyebrow size="sm">Outcome</Eyebrow>
            <Eyebrow size="sm">Check</Eyebrow>
            <Eyebrow size="sm">Reads</Eyebrow>
          </div>
        )}

        {/* The plan itself, and the only thing in this column that scrolls. */}
        <div style={{ ...PANE_FILL, overflow: 'auto' }}>
        {sections.map((sec) => {
          const shut = !!collapsed[sec.key]
          return (
          <div key={sec.key}>
            {/* The whole header is the toggle. A plan is read one group at a time —
                "is the standing rulebook right for this credit", then "what does the
                credit itself demand" — and folding the one you are not reading puts
                the one you are on screen whole.

                A folded group keeps saying everything it said open: label, count and
                aside. A collapse that hides the summary along with the rows is one
                that has to be undone before it can be read. */}
            <KindGroupHeader
              group={sec}
              count={sec.count}
              aside={selected ? null : sec.aside}
              showNote={!selected}
              open={!shut}
              onToggle={() => setCollapsed((c) => ({ ...c, [sec.key]: !c[sec.key] }))}
            />

            {/* A group either lists its checks or splits them once more. Only the
                requirement group splits, and only by coverage — the one question it
                is asked. A sub-head is a thin line rather than a second chip band,
                because it is a division within a group and should not read as a
                group of its own. */}
            {shut
              ? null
              : sec.checks.map((c) => (
                  <Row key={c.id} check={c} outcome={outcomeOf(c)} finding={findingFor(c)} on={c.id === selectedId} dense={!!selected} onSelect={() => pick(c.id)} />
                ))}
          </div>
          )
        })}

        {/* Reference, not work — one line until you ask for it. */}
        {skipped.length ? (
          <div>
            <button onClick={() => setShowSkipped((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 16px', border: 'none', borderTop: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icon name={showSkipped ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
              <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>
                {plural(skipped.length, 'check')} not brought into play by this credit — listed so nothing is silently absent
              </span>
            </button>
            {showSkipped
              ? skipped.map((c) => <Row key={c.id} check={c} outcome={{ outcome: 'NOT_RUN', outcomeReason: 'TRIGGER_NOT_MET' }} finding={null} on={c.id === selectedId} dense={!!selected} onSelect={() => pick(c.id)} />)
              : null}
          </div>
        ) : null}
        </div>
      </div>

      {selected ? <ResizeHandle width={railWidth} onResize={setRailWidth} side="left" min={240} max={560} reset={340} /> : null}

      {selected ? (
        // Its own scroller — there is no page scroll to be sticky in.
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', paddingLeft: 7 }}>
          <CheckSpecCard check={selected} outcome={outcomeOf(selected)} finding={findingFor(selected)} onOpenFinding={onOpenFinding} />
        </div>
      ) : null}
      </div>
    </section>
  )
}

function Row({ check, outcome, finding, on, dense, onSelect }) {
  const settledKey = settledBy(check)
  const by = SETTLED_BY[settledKey]
  const struck = !!check.suppressedBecause
  const muted = outcome?.outcome === 'NOT_RUN'

  // Which documents this check looks at. The service answers it for every kind of
  // check — a dictionary card declares its doc types, a compiled condition names them
  // in its operands, a requirement names them because the planner had the vocabulary.
  // Empty is a real answer: the check reads the presentation as a whole.
  const docs = check.docCodes ?? []
  const reads = docs.length ? docs.join(' · ') : 'the whole presentation'

  // The tooltip carries what the column cannot: for a suppressed rule the clause that
  // stood it down, otherwise how this check will be settled.
  const why = check.suppressedBecause ?? `${by.label} — ${by.note}`

  if (dense) {
    return (
      <button
        data-rail-id={check.id}
        onClick={onSelect}
        title={why}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 9,
          width: '100%',
          textAlign: 'left',
          padding: '9px 14px',
          border: 'none',
          borderBottom: '1px solid var(--me-grey-08)',
          borderLeft: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
          background: on ? 'var(--me-blue-20)' : '#fff',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', flexShrink: 0 }}>{check.id}</span>
            <span style={{ ...ellipsis, fontSize: 12.5, fontWeight: on ? 600 : 400, textDecoration: struck ? 'line-through' : 'none', color: on ? 'var(--me-blue-deep)' : muted ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>{check.name}</span>
          </span>
          <span style={{ ...ellipsis, fontSize: 11, color: 'var(--me-grey-70)' }}>
            {reads} · {by.label.toLowerCase()}
          </span>
        </span>
        <OutcomeLabel outcome={outcome} check={check} compact />
      </button>
    )
  }

  return (
    <button
      onClick={onSelect}
      title={why}
      style={{
        ...COLS,
        width: '100%',
        textAlign: 'left',
        padding: '10px 16px',
        border: 'none',
        borderBottom: '1px solid var(--me-grey-08)',
        borderLeft: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
        background: on ? 'var(--me-blue-20)' : '#fff',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ ...ellipsis, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>

      {/* Who answers this. Known when the check is planned and unchanged afterwards,
          which is what makes it worth reading *before* the run — it is the officer's
          answer to "how much of this is mine". */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <Icon name={by.icon} size={12} color={by.color} />
        <span style={{ ...ellipsis, fontSize: 11.5, color: by.color }}>{by.label}</span>
      </span>

      <OutcomeLabel outcome={outcome} check={check} />

      <span style={{ ...ellipsis, fontSize: 12.5, fontWeight: on ? 600 : 400, textDecoration: struck ? 'line-through' : 'none', color: on ? 'var(--me-blue-deep)' : muted ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>
        {check.name}
      </span>

      {/* Document codes, not the operand expression. Short enough to compare down a
          column, which is the only thing a column is for — the expression itself is
          in the detail pane under Conditions, where there is room to read it. */}
      <span style={{ ...ellipsis, fontFamily: docs.length ? 'var(--font-mono)' : 'inherit', fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        {reads}
      </span>
    </button>
  )
}

// What came of a check, or nothing at all before it has been settled.
//
// An em dash rather than the word "planned". A row that has not run yet has no
// outcome, and printing a lifecycle word in the outcome column is what made
// twenty-two rows read as placeholder text on a plan that had genuinely been made.
// The check is still *running* is a lifecycle fact too, which is why it renders as a
// spinner here rather than as a word in the outcome's own slot.
//
// The plan shows the engine's outcome and never an override: this screen is the run,
// and the officer's calls belong to Review. So it renders `OutcomeCell` with an
// un-overridden pair — one component, so the plan and the findings list cannot
// describe the same result two ways.
function OutcomeLabel({ outcome, check, compact }) {
  const base = { fontSize: compact ? 10.5 : 11, whiteSpace: 'nowrap', flexShrink: 0, lineHeight: '16px' }
  if (!outcome) return <span style={{ ...base, color: 'var(--me-grey-15)' }}>—</span>
  if (outcome.busy) {
    return (
      <span style={{ ...base, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--me-grey-70)' }}>
        <Spinner />
        {compact ? null : 'Running'}
      </span>
    )
  }
  // The clause that stood a rule down, or the trigger this credit never met, in the
  // credit's own words. The reason names the kind of absence and the cell's own
  // tooltip carries it; this names the instance, which is the thing worth reading.
  const title =
    outcome.outcomeReason === 'SET_ASIDE' ? check.suppressedBecause
      : outcome.outcomeReason === 'TRIGGER_NOT_MET' ? check.appliesBecause
      : undefined
  return (
    <span title={title} style={{ ...base }}>
      <OutcomeCell
        call={{ machine: outcome.outcome, value: outcome.outcome, overridden: false, reason: outcome.outcomeReason }}
        size={compact ? 10.5 : 11}
      />
    </span>
  )
}


const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }
