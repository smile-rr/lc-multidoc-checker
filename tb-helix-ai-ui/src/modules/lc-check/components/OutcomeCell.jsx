import Icon from '@shared/ds/Icon'
import { outcomeMeta, reasonMeta, initialsOf } from '../state/outcome'

// What came of a check, wherever one is shown.
//
// One component on every surface — the plan row, the findings table, the finding's
// own header, the decision list — because an outcome rendered three ways is three
// vocabularies again, which is the thing this whole change exists to end.
//
// **An override shows as initials, and the engine's own value moves to the tooltip.**
// An earlier draft printed both sides of the change in full — `DISCREPANT → Clean` —
// on the surfaces with room for it. That went when the cell became the control on all
// three of them: a trigger that is one width in a table, another in a header and a
// third on the decision list is three controls to learn, and the two characters saying
// *who* were carrying the fact that a person had been here anyway.

/**
 * The mark. Four shapes, one per outcome — a hazard triangle, a question, a tick,
 * and a dashed ring round nothing.
 *
 * It was a coloured dot in four shades, which put the whole distinction on hue: the
 * one thing a reader processes last, that a colour-blind officer may not process at
 * all, and that made a list of results indistinguishable from a list of statuses.
 * Silhouette is read before colour, so the triangle among circles is found first
 * whatever the palette does — and that is why the tick can afford to be green
 * without the discrepancy losing the race for attention.
 */
export function OutcomeMark({ outcome, size = 13 }) {
  const m = outcomeMeta(outcome)
  return (
    <span title={m.tip} style={{ display: 'inline-flex', flex: `0 0 ${size}px`, color: m.dot }}>
      <Icon name={m.icon} size={size} color="currentColor" />
    </span>
  )
}

/**
 * @param call from `outcomeOf(finding, overrides)` — the pair, resolved
 */
export default function OutcomeCell({ call, size = 12 }) {
  const m = outcomeMeta(call.value)
  const reason = reasonMeta(call.reason)

  // Everything the cell knows, in one tooltip: the engine's own value where a person
  // overruled it, and why an absence is the kind of absence it is.
  //
  // **The reason is not printed.** It was a second line under the label — `unanswerable`,
  // `human only`, `no rule` — and it read as noise on a list being scanned: a word in
  // the machine's vocabulary, in a monospace face, under every row that had not been
  // settled, saying something the officer could do nothing about at that moment. The
  // distinction it draws is real (a field to fix, a rule to write, a person's judgement)
  // and it is worth keeping — but it is worth keeping for whoever goes looking, not for
  // everybody reading past. Printing it also made DOUBT rows taller than the rest, so a
  // list where the outcome varied had a ragged left edge for no information gained.
  const wasTitle = [
    call.overridden
      ? `Changed from ${outcomeMeta(call.machine).label}${call.by ? ` by ${call.by}` : ''}${call.at ? ` · ${call.at}` : ''}`
      : m.tip,
    reason?.tip,
  ].filter(Boolean).join(' — ')

  // One line, always — so every row in a list is the same height whatever came of it.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <OutcomeMark outcome={call.value} size={size + 1} />

        <span
          title={wasTitle}
          style={{
            fontSize: size,
            whiteSpace: 'nowrap',
            // An overridden value is the officer's, so it carries the officer's
            // weight — ink, not the outcome's own hue. The hue belongs to what the
            // system concluded; this is somebody's signature on top of it.
            color: call.overridden ? 'var(--me-ink)' : m.text,
          }}
        >
          {m.label}
        </span>

        {/* Two characters that say who, and the only mark an override leaves on a
            row whose height must not change. */}
        {call.overridden ? (
          <span
            title={wasTitle}
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.05em',
              color: 'var(--me-grey-70)',
              borderBottom: '1px solid var(--me-grey-20)',
              paddingBottom: 1,
              cursor: 'help',
              whiteSpace: 'nowrap',
            }}
          >
          {initialsOf(call.by)}
        </span>
      ) : null}
    </span>
  )
}
