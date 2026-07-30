import { useMemo, useState } from 'react'
import { cardSurface } from '@shared/ds/Card'
import Icon from '@shared/ds/Icon'
import Chip from '@shared/ds/Chip'
import Eyebrow from '@shared/ds/Eyebrow'
import IconButton from '@shared/ds/IconButton'
import Spinner from '@shared/ds/Spinner'
import { ellipsis } from '@shared/ds/text'
import { plural } from '@shared/lib/format'
import { severityMeta } from '../state/severity'
import { SOURCE_META } from '../data/checkSpecs'
import CheckSpecCard from '../components/CheckSpecCard'
import { useCase } from '../state/CaseContext'

// Stage 3 — the plan, and it running.
//
// The plan is a real artefact, not a progress bar with labels: every check the
// credit brings into play is listed before anything executes, and each carries
// the rule it will apply plus the request that will be sent to apply it. Checks
// the credit does NOT trigger are listed too, with the reason — "we did not check
// that" must never be discovered after signing.
//
// ---------------------------------------------------------------------------
// Why this is grouped by KIND, and not by where the obligation comes from.
//
// A check varies along two axes: its **kind** (the system computes it, or an
// agent reads it) and its **source** (the credit's own terms, UCP 600 / ISBP 821,
// or bank policy). Both are real. Only one can structure the screen, and an
// earlier pass structured it by source — which was wrong for two reasons that
// have nothing to do with which axis is more interesting:
//
//   · Kind needs no expertise. "The system computes these, an agent reads those"
//     is legible to anyone. Grouping by source asks the reader to already know
//     why field 46A and article 20 are different kinds of authority — precisely
//     the knowledge a new checker has not got yet.
//   · Kind is the same on every deal. There are always exactly two groups. Source
//     groups appear and vanish with the credit, so the page moves under you from
//     one case to the next and nothing is where you left it.
//
// Source is not lost: it is the *Cited as* column. The domain knowledge is there
// for whoever wants it and costs nothing to whoever does not. Structure by what
// everyone can read; put what experts need in the data.
// ---------------------------------------------------------------------------
//
// The list changes shape according to whether it is the subject or the
// navigation, because those want opposite things:
//
//   nothing selected  the plan *is* the subject. Full width, one line per check,
//                     the whole plan at once and rows comparable down a column.
//                     This is the "is the plan right, and what is missing" read.
//   one selected      the plan becomes navigation. It shrinks to a rail and the
//                     check gets the room, because now the question is about that
//                     check and the answer is long — its conditions, the values it
//                     read, the request that will be sent.
//
// Clicking a row is the whole gesture: it already says "I want to study this", so
// a separate mode switch would be a second control for the same intent. Closing
// the panel (or clicking the selected row again) gives the overview back.
const COLS = {
  display: 'grid',
  gridTemplateColumns: '26px 96px minmax(0,1.4fr) minmax(0,1.9fr) minmax(0,0.9fr) 88px',
  gap: 14,
  alignItems: 'center',
}

// Operators shortened for the column. The spec card spells them out; here the
// point is that twenty rows stay readable side by side.
const OPS = {
  'is on or before': '≤',
  'is on or after': '≥',
  'is at most': '≤',
  'is at least': '≥',
  equals: '=',
  'equals (amount)': '=',
  'is within': 'within',
  'does not conflict with': 'no conflict with',
  'is the same party as': 'same party as',
}

export default function ChecksScreen({ onOpenFinding }) {
  const { data, run, officer, actions } = useCase()
  const allChecks = useMemo(() => [...data.checks, ...officer.addedChecks], [data.checks, officer.addedChecks])
  const [selectedId, setSelectedId] = useState(null)
  const [showSkipped, setShowSkipped] = useState(false)

  const executing = run.activeStep === 'execute' || run.done.includes('execute')
  const planned = run.done.includes('plan')

  const statusOf = (check) => {
    if (!check.areaId) return check.addedByOfficer ? (run.finished ? 'done' : executing ? 'running' : 'planned') : 'skipped'
    if (!executing) return 'planned'
    // A rule is arithmetic over fields already extracted: it settles in the same
    // tick the run starts, so it is never queued behind an agent reading pages.
    if (check.kind === 'rule') return 'done'
    if (run.completedAreaIds.includes(check.areaId)) return 'done'
    if (run.activeAreaId === check.areaId) return 'running'
    return 'queued'
  }

  const findingFor = (check) =>
    statusOf(check) === 'done' && check.findingId ? data.findings.find((f) => f.id === check.findingId) ?? null : null

  const runnable = allChecks.filter((c) => c.areaId || c.addedByOfficer)
  const rules = runnable.filter((c) => c.kind === 'rule')
  const reqs = runnable.filter((c) => c.kind !== 'rule')
  const skipped = allChecks.filter((c) => !c.areaId && !c.addedByOfficer)
  const blocked = rules.filter((c) => c.ruleDef && !c.ruleDef.ready)
  const estTokens = Math.round(reqs.length * 4.9)

  // A critical failure found on the figures is the case where reading on may be
  // waste: the presentation is refused whatever :47A: says. Whether to stop is a
  // policy chosen before the run, so Auto never surprises you — and it sits on
  // the group it governs instead of in a banner of its own.
  const criticalRuleFailures = rules
    .map((c) => (statusOf(c) === 'done' && c.findingId ? data.findings.find((f) => f.id === c.findingId) : null))
    .filter((f) => f && f.severity === 'discrepancy')
  const halted = officer.stopOnRuleFailure && executing && !run.finished && criticalRuleFailures.length > 0

  const selected = selectedId ? allChecks.find((c) => c.id === selectedId) : null
  const pick = (id) => setSelectedId((cur) => (cur === id ? null : id))

  const sections = [
    {
      key: 'rule',
      icon: 'equal',
      tone: 'blue',
      label: 'Rule',
      count: rules.length,
      note: 'The system compares fields already extracted. No model, no cost, same answer every time.',
      checks: rules,
      aside: blocked.length ? { warn: true, text: `${plural(blocked.length, 'rule')} needs a field that was not extracted` } : null,
    },
    {
      key: 'requirement',
      icon: 'list-checks',
      tone: 'green',
      label: 'Requirement',
      count: reqs.length,
      note: 'An agent reads it against the presentation and forms a view.',
      checks: reqs,
      aside: { text: `about ${estTokens}k tokens` },
      policy: true,
    },
  ].filter((s) => s.count)

  return (
    <section
      className="helix-screen"
      style={{
        padding: '16px 24px 28px',
        display: 'grid',
        gridTemplateColumns: selected ? 'minmax(280px,340px) minmax(460px,1fr)' : 'minmax(0,1fr)',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', minWidth: 0 }}>
        {/* One line of state. What each half costs, which rules are blocked and
            whether to stop all moved onto the group they belong to — the plan
            itself is what needed the vertical room. */}
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Check plan</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>
            {run.finished ? 'complete' : executing ? `${run.completedAreaIds.length} of ${data.areas.length} areas` : planned ? 'planned — not run' : 'not planned yet'}
            {' · '}
            {runnable.length} to run
          </span>
          <div style={{ flex: 1 }} />
          {!executing && (
            <button onClick={actions.addCheck} title="Add a check the credit does not call for — it runs with the rest and is recorded against your name" style={linkBtn}>
              <Icon name="plus" size={14} />
              Add a check
            </button>
          )}
        </div>

        {halted && (
          <div style={{ margin: '12px 16px 0', border: '1px solid #E9C97A', background: '#FBEFCF', borderRadius: 10, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Icon name="circle-pause" size={15} color="#946400" />
            <span style={{ flex: 1, minWidth: 200, fontSize: 12, lineHeight: 1.5, color: '#946400' }}>
              Stopped on {criticalRuleFailures.map((f) => f.checkId).join(', ')}. The {reqs.length} requirements have not run — about {estTokens}k tokens.
            </span>
            <button onClick={() => actions.dispatch({ type: 'stop_on_rule_failure', on: false })} style={{ ...linkBtn, color: '#946400', fontWeight: 600 }}>Read on anyway</button>
            <button onClick={() => onOpenFinding?.(criticalRuleFailures[0].id)} style={{ ...linkBtn, color: '#946400', fontWeight: 600 }}>Take it to the report</button>
          </div>
        )}

        {!selected && (
          <div style={{ ...COLS, padding: '9px 16px', borderBottom: '1px solid var(--me-grey-15)' }}>
            <span />
            <Eyebrow size="sm">ID</Eyebrow>
            <Eyebrow size="sm">Check</Eyebrow>
            <Eyebrow size="sm">What it reads</Eyebrow>
            <Eyebrow size="sm">Cited as</Eyebrow>
            <Eyebrow size="sm">State</Eyebrow>
          </div>
        )}

        {sections.map((sec) => (
          <div key={sec.key}>
            {/* The group header *is* the kind indicator, and it carries that
                kind's economics — so no row has to repeat either. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap' }}>
              <Chip size="sm" tone={sec.tone}>
                <Icon name={sec.icon} size={11} />
                {sec.label}
              </Chip>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{sec.count}</span>
              {!selected && <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{sec.note}</span>}
              <div style={{ flex: 1 }} />
              {sec.aside && !selected ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: sec.aside.warn ? '#946400' : 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
                  {sec.aside.warn ? <Icon name="circle-alert" size={12} color="currentColor" /> : null}
                  {sec.aside.text}
                </span>
              ) : null}
              {sec.policy && !executing && !selected ? (
                <label
                  title="A critical failure on the figures refuses the presentation whatever the conditions say, so reading on may be spend for nothing"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--me-grey)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <input type="checkbox" checked={officer.stopOnRuleFailure} onChange={(e) => actions.dispatch({ type: 'stop_on_rule_failure', on: e.target.checked })} />
                  skip if a rule fails
                </label>
              ) : null}
            </div>

            {sec.checks.map((c) => (
              <Row key={c.id} check={c} status={statusOf(c)} finding={findingFor(c)} on={c.id === selectedId} dense={!!selected} onSelect={() => pick(c.id)} />
            ))}
          </div>
        ))}

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
              ? skipped.map((c) => <Row key={c.id} check={c} status="skipped" finding={null} on={c.id === selectedId} dense={!!selected} onSelect={() => pick(c.id)} />)
              : null}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div style={{ position: 'sticky', top: 'calc(var(--case-header-h, 240px) + 16px)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Eyebrow size="sm">Selected check</Eyebrow>
            <div style={{ flex: 1 }} />
            <IconButton icon="x" size="sm" title="Close, and read the whole plan" onClick={() => setSelectedId(null)} />
          </div>
          <CheckSpecCard check={selected} status={statusOf(selected)} finding={findingFor(selected)} onOpenFinding={onOpenFinding} />
        </div>
      ) : null}
    </section>
  )
}

function Row({ check, status, finding, on, dense, onSelect }) {
  const sev = finding ? severityMeta(finding.severity) : null
  const src = SOURCE_META[check.source] ?? SOURCE_META.credit
  const rd = check.ruleDef
  const needsField = rd && !rd.ready
  const muted = status === 'skipped' || status === 'queued'
  const refs = check.spec?.refs ?? []

  // What this check looks at, said the same way for both kinds: for a rule the
  // comparison itself, for a requirement the credit fields it is handed. A rule
  // whose condition you cannot read is a label, not a rule.
  // When both sides name the same field the documents *are* the comparison —
  // "Goods description no conflict with Goods description" says nothing. Name them
  // only then, so the column stays short where the field names already differ.
  const reads = rd
    ? rd.rows
        .map((r) => {
          const right = r.r.field ?? r.r.literal
          const same = r.l.field === r.r.field
          const l = same ? `${r.l.field} @ ${r.l.doc}` : r.l.field
          const rr = same ? `@ ${r.r.doc}` : right
          return `${l} ${OPS[r.op] ?? r.op} ${rr}`
        })
        .join('   ·   ')
    : creditFieldsOf(check).length
      ? creditFieldsOf(check).map((t) => `:${t}:`).join(' ')
      : 'the whole presentation'

  if (dense) {
    return (
      <button
        onClick={onSelect}
        title={reads}
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
        <span style={{ flex: '0 0 15px', height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StatusIcon status={status} finding={finding} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', flexShrink: 0 }}>{check.id}</span>
            <span style={{ ...ellipsis, fontSize: 12.5, fontWeight: on ? 600 : 400, color: on ? 'var(--me-blue-deep)' : muted ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>{check.name}</span>
          </span>
          <span style={{ ...ellipsis, fontSize: 11, color: 'var(--me-grey-70)' }}>{reads}</span>
        </span>
        <StateLabel check={check} status={status} finding={finding} sev={sev} rd={rd} needsField={needsField} compact />
      </button>
    )
  }

  return (
    <button
      onClick={onSelect}
      title={reads}
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
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <StatusIcon status={status} finding={finding} />
      </span>

      <span style={{ ...ellipsis, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>

      <span style={{ ...ellipsis, fontSize: 12.5, fontWeight: on ? 600 : 400, color: on ? 'var(--me-blue-deep)' : muted ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>
        {check.name}
      </span>

      <span style={{ ...ellipsis, fontSize: 11.5, color: rd ? 'var(--me-grey)' : 'var(--me-grey-70)', fontFamily: rd ? 'inherit' : 'var(--font-mono)' }}>{reads}</span>

      <span title={`${src.label}${refs.length ? ` — ${refs.join(', ')}` : ''}`} style={{ ...ellipsis, fontSize: 11.5, color: 'var(--me-grey-70)' }}>
        {refs.join(', ') || src.cite}
      </span>

      <StateLabel check={check} status={status} finding={finding} sev={sev} rd={rd} needsField={needsField} />
    </button>
  )
}

function StatusIcon({ status, finding }) {
  if (status === 'running') return <Spinner />
  return (
    <Icon
      name={status === 'done' ? 'check' : status === 'skipped' ? 'minus' : 'circle-dashed'}
      size={14}
      color={status === 'done' ? (finding && finding.severity !== 'clean' ? 'var(--status-warning)' : 'var(--status-success)') : 'var(--me-grey-50)'}
    />
  )
}

// The one column that must never be dropped for space: it is the difference
// between "we checked and it passed" and "we could not check".
function StateLabel({ check, status, finding, sev, rd, needsField, compact }) {
  const base = { fontSize: compact ? 10.5 : 11, whiteSpace: 'nowrap', flexShrink: 0, lineHeight: '16px' }
  if (needsField) return <span title={`Not extracted: ${rd.missing.map((m) => `${m.field} @ ${m.doc}`).join(', ')}`} style={{ ...base, color: '#946400' }}>needs a field</span>
  if (check.notCovered) return <span title="No rule covers this condition" style={{ ...base, color: '#946400' }}>not covered</span>
  if (sev && finding.severity !== 'clean') return <span style={{ ...base, color: sev.text }}>{finding.severity === 'discrepancy' ? 'discrepancy' : 'to decide'}</span>
  if (status === 'done') return <span style={{ ...base, color: 'var(--status-success)' }}>passed</span>
  return <span style={{ ...base, color: 'var(--me-grey-50)' }}>{compact ? '' : status}</span>
}

/** The credit fields a requirement is handed, read off its own rule text. */
function creditFieldsOf(check) {
  const seen = []
  const re = /\{(\d{2}[A-Z]?)\}/g
  let m
  while ((m = re.exec(check.spec?.rule ?? '')) !== null) if (!seen.includes(m[1])) seen.push(m[1])
  return seen.slice(0, 4)
}

const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }
