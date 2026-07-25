import { useState } from 'react'
import { Link } from 'react-router-dom'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import Badge from '@shared/ds/Badge'
import Icon from '@shared/ds/Icon'
import RuleText from '@shared/ds/RuleText'
import Tabs from '@shared/ds/Tabs'
import { toneOf } from '@shared/lib/tone'


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

  return (
    <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
          { id: 'plan', label: 'Execution plan' },
          { id: 'result', label: 'Result' },
        ]}
      />

      <div style={{ padding: '16px 20px 20px' }}>
        {tab === 'rule' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Trigger">
              <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }}>{check.appliesBecause}.</span>
            </Field>
            <Field label="Rule">
              {spec.rule ? (
                <RuleText text={spec.rule} />
              ) : (
                <span style={{ fontSize: 13, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>No rule text recorded.</span>
              )}
            </Field>
            {check.notCovered ? (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: '#FBEFCF', fontSize: 12.5, color: '#946400', lineHeight: 1.55 }}>
                No rule in the dictionary tests this condition, so it was not examined. It is passed to you as an open question.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'plan' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
              The request that executes this check, verbatim — not a description of it.
            </span>
            <MarkdownDoc
              text={check.executionPlan}
              label="Model request"
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
      <span style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{label}</span>
      {children}
    </div>
  )
}
