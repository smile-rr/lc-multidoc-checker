import Eyebrow from '@shared/ds/Eyebrow'
import { operatorLabel, operatorUnary } from '@shared/lib/operators'

// ===========================================================================
// A condition, read rather than authored.
//
// One component for the two places an officer meets the same rows:
//
//   the plan     what this check INTENDS to compare — operands named, nothing read
//   the review   what it DID compare — the same rows, each side carrying its value
//
// They are one shape at two saturations (`ComparisonView` on the wire), so they are
// one component. Two would have been two vocabularies for the thing an officer
// reads as one, and the second would have drifted the first time either grew a
// column.
//
// The service resolves `opLabel` and `docLabel` when it writes a finding, because a
// finding is evidence: it says what the words meant on the day, not what they would
// mean if re-rendered years later against a dictionary that has moved on. Where
// they are absent — mock fixtures, an older row — the vocabulary is looked up here.
// ===========================================================================

const TONE = {
  FAIL: { border: 'var(--status-error)', bg: '#FBE3E1', ink: 'var(--status-error)', label: 'failed' },
  PASS: { border: 'var(--me-grey-15)', bg: '#fff', ink: 'var(--me-grey-70)', label: 'held' },
  INCONCLUSIVE: { border: '#E9C97A', bg: '#FBEFCF', ink: '#946400', label: 'could not be answered' },
  NOT_RUN: { border: 'var(--me-grey-15)', bg: 'transparent', ink: 'var(--me-grey-50)', label: '' },
}

// Which kind of absence, per row. One check can be blocked by a missing document on
// one row and an unread field on another, and those are two different things to go
// and do — so the row says which, rather than the finding saying "unanswerable" once
// for both. `not presented` is the presentation's gap; `not read` is ours.
const GAP = {
  NOT_PRESENTED: 'not presented',
  NOT_EXTRACTED: 'not read',
  UNPARSEABLE: 'unusable value',
}

/**
 * @param condition a ComparisonView — `{ scope, message, failedRow, rows }`
 * @param compact   the plan's reading: no verdict column, no Raise line
 */
export default function ConditionRows({ condition, compact = false }) {
  const rows = condition?.rows ?? []
  if (!rows.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      {!compact && condition.scope ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Eyebrow size="sm">Compared</Eyebrow>
          <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{condition.scope}</span>
        </div>
      ) : null}

      {rows.map((r, i) => (
        <ConditionRow key={r.id ?? i} row={r} first={i === 0} compact={compact} />
      ))}

      {/* The author's own wording, which is what the discrepancy is actually stated
          in — not the sentence the engine composed out of the values. */}
      {!compact && condition.message ? (
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>
          Raised as: {condition.message}
        </span>
      ) : null}
    </div>
  )
}

function ConditionRow({ row, first, compact }) {
  const tone = TONE[row.outcome] ?? TONE.NOT_RUN
  const unary = operatorUnary(row.op)
  const op = row.opLabel || operatorLabel(row.op)

  const line = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      {compact && !first ? (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--me-grey-50)' }}>and</span>
      ) : null}
      <Side o={row.left} />
      <span style={{ fontWeight: 600, color: 'var(--me-blue-deep)' }}>{op}</span>
      {unary ? null : <Side o={row.right} />}
      {/* Only ever present where the operator reads one — the service blanks it
          elsewhere rather than showing an author's inert note as if it applied. */}
      {row.tol ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>({row.tol})</span>
      ) : null}
      {compact ? null : (
        <>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: tone.ink }}>
            {GAP[row.gap] ?? tone.label}
          </span>
        </>
      )}
    </div>
  )

  if (compact) return line

  return (
    <div style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {line}
      {/* Why it went the way it did, but only where that is not already obvious from
          the two values sitting above it. */}
      {row.why && row.outcome !== 'PASS' ? (
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>{row.why}</span>
      ) : null}
    </div>
  )
}

function Side({ o }) {
  if (!o) return null
  if (o.literal) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-ink)' }}>
        “{o.value}”
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: 'var(--me-ink)' }}>{o.label || o.field}</span>
      {o.doc ? (
        <span title={o.docLabel ?? undefined} style={{ fontSize: 10.5, color: 'var(--me-grey-70)' }}>@ {o.doc}</span>
      ) : null}
      {/* Absent on the plan, where nothing has been read yet — and "not extracted"
          rather than blank once it has, because a blank reads as a value that
          happened to be empty. */}
      {o.value != null || o.resolved ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: o.resolved ? 'var(--me-ink)' : '#946400' }}>
          {o.resolved ? o.value : 'not extracted'}
        </span>
      ) : null}
    </span>
  )
}
