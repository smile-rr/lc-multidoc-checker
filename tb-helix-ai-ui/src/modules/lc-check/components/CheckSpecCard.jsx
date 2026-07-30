import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import Badge from '@shared/ds/Badge'
import Icon from '@shared/ds/Icon'
import RuleText from '@shared/ds/RuleText'
import Tabs from '@shared/ds/Tabs'
import { toneOf } from '@shared/lib/tone'
import { SOURCE_META } from '../data/checkSpecs'


// One side of a condition: a dictionary field read off a named document, or a
// value derived on the spot.
function Operand({ o }) {
  if (!o) return null
  if (o.literal) return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-ink)', background: 'var(--me-grey-08)', borderRadius: 5, padding: '2px 6px' }}>{o.literal}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 6, padding: '2px 7px' }}>
      <span style={{ fontWeight: 600, color: 'var(--me-ink)' }}>{o.field}</span>
      <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)' }}>{o.doc}</span>
    </span>
  )
}

const SEVERITY_TONE = { CRITICAL: 'error', MAJOR: 'warning', MINOR: 'neutral' }

const STATUS_LABEL = { planned: 'Planned', queued: 'Queued', running: 'Running now', done: 'Done', skipped: 'Not run' }
const STATUS_TONE = { done: 'green', running: 'blue', skipped: 'neutral', planned: 'neutral', queued: 'neutral' }

/**
 * What a check is, for one credit.
 *
 * Three tabs, in the order the questions get asked: the rule it applies, the
 * request that will execute it, and what came back. Previously this pane showed
 * "run by / applies / rule reference" — metadata about a check rather than the
 * check itself, which told an officer nothing they could act on.
 */
export default function CheckSpecCard({ check, status, finding, onOpenFinding }) {
  const [tab, setTab] = useState('rule')
  const spec = check.spec
  const sevTone = toneOf(SEVERITY_TONE[spec.severity] ?? 'neutral')
  // A rule carries its rows and its resolved operands; a requirement carries a
  // compiled prompt. Which one this is decides what the card can honestly show.
  const rd = check.ruleDef
  const isRule = check.kind === 'rule' && !!rd
  const src = SOURCE_META[check.source] ?? SOURCE_META.credit

  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
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
          <span>{spec.agent} agent</span>
          {spec.refs.length ? (
            <>
              <span>·</span>
              {spec.refs.map((r) => (
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
          { id: 'plan', label: isRule ? 'Inputs' : 'Execution Plan' },
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
                <span style={{ color: 'var(--me-grey-70)' }}>· {spec.refs.join(', ') || 'no article recorded'}</span>
              </span>
            </Field>
            <Field label="Trigger">
              <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }}>{check.appliesBecause}.</span>
            </Field>
            {isRule ? (
              <>
                <Field label="Applies to">
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }}>{rd.scope}</span>
                </Field>
                <Field label="Conditions">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rd.rows.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', fontSize: 12.5 }}>
                        {i > 0 && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--me-grey-50)' }}>and</span>}
                        <Operand o={r.l} />
                        <span style={{ fontWeight: 600, color: 'var(--me-blue-deep)' }}>{r.op}</span>
                        <Operand o={r.r} />
                        {r.tol ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>({r.tol})</span> : null}
                      </div>
                    ))}
                  </div>
                </Field>
                <Field label="Raises">
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-grey)' }}>{rd.message}</span>
                </Field>
              </>
            ) : null}
            {isRule ? null : (
            <Field label="Rule">
              {spec.rule ? (
                <RuleText text={spec.rule} />
              ) : (
                <span style={{ fontSize: 13, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>No rule text recorded.</span>
              )}
            </Field>
            )}
            {check.notCovered ? (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: '#FBEFCF', fontSize: 12.5, color: '#946400', lineHeight: 1.55 }}>
                No rule in the dictionary tests this condition, so it was not examined. It is passed to you as an open question.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'plan' && isRule ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              Nothing is sent anywhere: this check is evaluated here, on the fields below. It gives
              the same answer every time it is run on the same presentation.
            </span>
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
            {!rd.ready ? (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: '#FBEFCF', fontSize: 12.5, color: '#946400', lineHeight: 1.55 }}>
                This rule cannot be answered on this presentation — {rd.missing.map((m) => `${m.field} @ ${m.doc}`).join(' and ')} was not extracted.
                It will be reported as not covered. A missing input is not evidence of compliance.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'plan' && !isRule ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              The request that executes this check, verbatim — not a description of it.
            </span>
            <MarkdownDoc
              text={check.executionPlan}
              label="Model Request"
              meta={`markdown · ${check.executionPlan.split('\n').length} lines`}
              maxHeight={520}
            />
          </div>
        ) : null}

        {tab === 'result' ? (
          status !== 'done' ? (
            <span style={{ fontSize: 13, color: 'var(--me-grey-70)' }}>
              {status === 'skipped'
                ? 'Not run for this credit — the trigger above was not met.'
                : status === 'running'
                  ? 'Running now.'
                  : 'Not run yet.'}
            </span>
          ) : finding ? (
            <button
              onClick={() => onOpenFinding(finding.id)}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)', lineHeight: 1.4 }}>{finding.title}</span>
              <span style={{ fontSize: 12.5, color: 'var(--me-grey)', lineHeight: 1.55 }}>{finding.analysis.why}</span>
              <span style={{ fontSize: 11.5, color: 'var(--me-blue)' }}>Review this finding →</span>
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--status-success)' }}>
              <Icon name="check" size={14} />
              Nothing to report.
            </span>
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
