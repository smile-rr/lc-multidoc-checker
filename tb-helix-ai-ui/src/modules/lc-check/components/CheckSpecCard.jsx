import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import Chip from '@shared/ds/Chip'
import Icon from '@shared/ds/Icon'
import RuleText from '@shared/ds/RuleText'
import Tabs from '@shared/ds/Tabs'
import Notice from '@shared/ds/Notice'
import { toneOf } from '@shared/lib/tone'
import { SOURCE_META } from '../data/checkSpecs'
import OutcomeCell from './OutcomeCell'
import ConditionRows from './ConditionRows'
import { useCase } from '../state/CaseContext'

const SEVERITY_TONE = { CRITICAL: 'error', MAJOR: 'warning', MINOR: 'neutral' }

// The outcome is rendered by `OutcomeCell`, the same component the plan row and the
// findings list use — so the pane you open from a row cannot describe that row's
// result in different words from the row itself. It used to be a Badge with its own
// tone map, which is how "passed" came to be green here and grey three centimetres
// to the left.

/**
 * What a check is, for one credit.
 *
 * Three tabs, in the order the questions get asked: the rule it applies, the
 * request that will execute it, and what came back. Previously this pane showed
 * "run by / applies / rule reference" — metadata about a check rather than the
 * check itself, which told an officer nothing they could act on.
 */
export default function CheckSpecCard({ check, outcome, finding, onOpenFinding }) {
  const [tab, setTab] = useState('rule')
  const { run } = useCase()
  // Normalised once, because `spec` is a map the service assembles and not every
  // check has every key — a gate carries a severity and a rule and nothing else.
  // Reading `spec.refs.length` off one of those threw, and a thrown render is a
  // white screen: the officer clicked a hard check and the workbench vanished.
  // Absent detail must render as absent detail.
  const spec = check.spec ?? {}
  const refs = spec.refs ?? []
  const sevTone = toneOf(SEVERITY_TONE[spec.severity] ?? 'neutral')
  const rd = check.ruleDef
  // The condition, wherever it came from — `spec.condition` against the service,
  // resolved client-side into `ruleDef` against the fixtures. Both are the same
  // ComparisonView the review screen draws, unsaturated: every operand named and
  // nothing read yet. A requirement the planner compiled out of :47A: exists in no
  // dictionary, and it is the one whose working most needs reading, because nobody
  // reviewed it before it ran.
  const condition = spec.condition ?? rd ?? null
  const rows = condition?.rows ?? []
  // Whether this is settled by comparing fields or by an agent reading. It decides
  // what the card can honestly show, and which tab the middle one is.
  const isExact = check.tier === 'exact' && rows.length > 0
  // Which *kind* of card it is, which is a different question — a requirement the
  // planner compiled is exact and is still a requirement. Reading the kind off the
  // tier labelled every compiled :47A: condition "Rule", which is the one thing it
  // is not: a rule was authored and approved before it ever ran, and this was
  // written during this run and reviewed by nobody.
  const isRequirement = check.plannedByLlm || check.origin === 'credit'
  const src = SOURCE_META[check.source] ?? SOURCE_META.credit

  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>
          {outcome?.outcome ? (
            <OutcomeCell
              call={{ machine: outcome.outcome, value: outcome.outcome, overridden: false, reason: outcome.outcomeReason }}
              size={12}
            />
          ) : null}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: sevTone.text }}>{spec.severity}</span>
          {check.plannedByLlm ? (
            <span
              title="Not in the dictionary — the planner wrote this check for this credit"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', fontSize: 11, fontWeight: 600 }}
            >
              <Icon name="sparkles" size={11} />
              Planner
            </span>
          ) : null}
        </div>

        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35, color: 'var(--me-ink)', textWrap: 'pretty' }}>
          {check.name}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--me-grey-70)' }}>
          {spec.agent ? <span>{spec.agent} agent</span> : null}
          {refs.length ? (
            <>
              {spec.agent ? <span>·</span> : null}
              {refs.map((r) => (
                <span key={r} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--me-grey-08)', color: 'var(--me-blue-deep)' }}>
                  {r}
                </span>
              ))}
            </>
          ) : null}
          {check.source === 'dictionary' ? (
            <>
              <span>·</span>
              <Link to="/governance/checks" title="Open this check in Governance">
                Open in Governance →
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Which kind of check this is, stated before its content — the two cards
          share a shell, so the shell has to say which one you are reading. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 20px', background: isRequirement ? 'var(--me-green-20)' : 'var(--me-blue-20)', borderBottom: '1px solid var(--me-grey-15)', flexWrap: 'wrap' }}>
        <Chip size="sm" tone={isRequirement ? 'green' : 'blue'}>
          <Icon name={isRequirement ? 'list-checks' : 'equal'} size={11} />
          {isRequirement ? 'Requirement' : 'Rule'}
        </Chip>
        {/* Kind and how it is settled — they cross freely, so both are stated. One
            clause each; the long version was two sentences nobody read twice. */}
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: isRequirement ? '#1F7A00' : 'var(--me-blue-deep)' }}>
          {isRequirement ? "Read from this credit's own text" : 'From the dictionary'}
          {' · '}
          {isExact ? 'settled by comparison' : 'settled by an agent'}
        </span>
      </div>

      {/* Set aside for this credit. Above the tabs, because it changes what every
          one of them means: none of this ran. */}
      {check.suppressedBecause ? (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--me-grey-15)' }}>
          <Notice tone="warning" title="Set aside for this credit">
            {check.suppressedBecause} You have a card asking you to confirm that.
          </Notice>
        </div>
      ) : null}

      {/* The planner's reason for ending the run, on the check that caused it.
          It used to be a banner across the top of the plan — where it repeated the
          status badge, cost a quarter of the screen, and sat nowhere near the row it
          was about. An officer who wants to know why the examination stopped clicks
          the check that stopped it, which is where they were already looking. */}
      {check.gate && outcome?.outcome === 'DISCREPANT' && run.stoppedAfterPlan && run.stoppedBecause ? (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--me-grey-15)' }}>
          {/* The detail pane is where the reasoning belongs — somebody clicked to get
              here. The list screens say "17 checks not run" and stop. */}
          <Notice tone="warning" icon="shield-alert" title="The examination stopped here">
            {run.stoppedBecause}
          </Notice>
        </div>
      ) : null}

      <Tabs
        style={{ padding: '8px 20px 0', borderBottom: '1px solid var(--me-grey-15)' }}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'rule', label: 'Rule' },
          // A Rule card has no request to read — nothing is sent anywhere. The
          // equivalent thing an officer needs in order to trust it is the values
          // it compared and where each came from. Same promise, same place, the
          // artefact that actually exists for this kind of check.
          { id: 'plan', label: isExact ? 'Inputs' : 'Execution Plan' },
          { id: 'result', label: 'Result' },
        ]}
      />

      <div style={{ padding: '16px 20px 20px' }}>
        {tab === 'rule' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Cited as">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--me-ink)' }}>
                <Icon name={src.icon} size={14} color={src.color} />
                {src.label}
                <span style={{ color: 'var(--me-grey-70)' }}>· {refs.join(', ') || 'no article recorded'}</span>
              </span>
            </Field>
            <Field label="Trigger">
              <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }}>{check.appliesBecause}.</span>
            </Field>
            {isExact ? (
              <>
                {/* Fixture-only detail. The service sends the condition and not a
                    sentence about its scope, so this is absent rather than blank
                    where it has nothing to say. */}
                {condition?.scope ? (
                  <Field label="Applies to">
                    <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }}>{condition.scope}</span>
                  </Field>
                ) : null}
                <Field label="Conditions">
                  {/* The same rows the review screen shows, before anything has been
                      read. One component, so what the officer confirms on the plan is
                      recognisably what they are shown afterwards. */}
                  <ConditionRows condition={condition} compact />
                </Field>
                {condition?.message ? (
                  <Field label="Raises">
                    <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-grey)' }}>{condition.message}</span>
                  </Field>
                ) : null}
              </>
            ) : (
            <Field label="Rule">
              {spec.rule ? (
                <RuleText text={spec.rule} />
              ) : (
                <span style={{ fontSize: 13, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>No rule text recorded.</span>
              )}
            </Field>
            )}
            {check.coverage === 'human' || (check.notCovered && !isExact) ? (
              <Notice tone="warning" icon="user">
                Nothing on the plan tests this. Yours to settle.
              </Notice>
            ) : null}
          </div>
        ) : null}

        {tab === 'plan' && isExact ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              Nothing is sent anywhere: this check is evaluated here, on the fields below. It gives
              the same answer every time it is run on the same presentation.
            </span>
            {/* Each operand with the value actually read for it. Resolved client-side
                against the fixtures; against the service it is the `comparison` rows
                on the finding, which the Result tab links to — so this table appears
                only where the values are genuinely in hand. Listing operands with no
                values would look like a reading that came back empty. */}
            {!rd ? (
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
                The values it compared are on its result, once it has run.
              </span>
            ) : (
            <div style={{ ...cardSurface(10), boxShadow: 'none', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1.2fr) 64px', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)' }}>
                <Eyebrow size="sm">Field</Eyebrow>
                <Eyebrow size="sm">Read from</Eyebrow>
                <Eyebrow size="sm">Value</Eyebrow>
                <Eyebrow size="sm">Conf.</Eyebrow>
              </div>
              {rd.inputs.map((inp, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1.2fr) 64px', gap: 12, padding: '9px 12px', borderBottom: i < rd.inputs.length - 1 ? '1px solid var(--me-grey-08)' : 'none', alignItems: 'center', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--me-ink)' }}>{inp.field}</span>
                  <span style={{ color: 'var(--me-grey-70)' }}>{inp.doc}</span>
                  <span style={{ color: inp.resolved ? 'var(--me-ink)' : '#946400', fontFamily: inp.resolved ? 'var(--font-mono)' : 'inherit' }}>
                    {inp.resolved ? inp.value : 'not extracted'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{inp.confidence ?? '—'}</span>
                </div>
              ))}
            </div>
            )}
            {rd && !rd.ready ? (
              <Notice tone="warning">
                This rule cannot be answered on this presentation — {rd.missing.map((m) => `${m.field} @ ${m.doc}`).join(' and ')} was not extracted.
                It is reported as unanswerable. A missing input is not evidence of compliance.
              </Notice>
            ) : null}
          </div>
        ) : null}

        {tab === 'plan' && !isExact ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              The request that executes this check, verbatim — not a description of it.
            </span>
            {/* A check with no compiled prompt is not a broken card. A gate is
                evaluated in code and never asks a model anything, so there is no
                request to show — and `null.split` here was the second way this
                tab took the screen down. */}
            {check.executionPlan ? (
              <MarkdownDoc
                text={check.executionPlan}
                label="Model Request"
                meta={`markdown · ${check.executionPlan.split('\n').length} lines`}
                maxHeight={520}
              />
            ) : (
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
                Nothing is sent. This check is settled in code, on the credit and the
                presentation record alone.
              </span>
            )}
          </div>
        ) : null}

        {tab === 'result' ? (
          !finding ? (
            <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              {outcome?.busy
                ? 'Running now.'
                : outcome?.outcomeReason === 'TRIGGER_NOT_MET'
                  ? 'This credit never brought it into play — the trigger above was not met.'
                  : outcome?.outcomeReason === 'SET_ASIDE'
                    ? "Stood down by this credit's own terms, so it was never run."
                    : outcome?.outcomeReason === 'NOT_REACHED'
                      ? 'The plan ended before this ran. You can still run it from the workbench.'
                      : outcome?.outcome === 'CLEAN'
                        ? 'Nothing to report.'
                        : 'Not run yet.'}
            </span>
          ) : (
            <button
              onClick={() => onOpenFinding(finding.id)}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)', lineHeight: 1.4 }}>{finding.title}</span>
              {/* A finding the planner raised has no analysis — nobody has looked at
                  it yet, which is the whole reason it is on the report. */}
              {finding.analysis?.why ? (
                <span style={{ fontSize: 12.5, color: 'var(--me-grey)', lineHeight: 1.55 }}>{finding.analysis.why}</span>
              ) : null}
              <span style={{ fontSize: 11.5, color: 'var(--me-blue)' }}>Review this finding →</span>
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Eyebrow size="sm">{label}</Eyebrow>
      {children}
    </div>
  )
}
