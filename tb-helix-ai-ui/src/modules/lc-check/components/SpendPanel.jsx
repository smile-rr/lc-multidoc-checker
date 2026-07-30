import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import InfoTip from '@shared/ds/InfoTip'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { duration, durationShort, usd, percent, plural } from '@shared/lib/format'
import { qualityRates } from '../data/fixtures.js'

// How the automated examination is performing, across the queue.
//
// Titled "AI Performance" and nothing cleverer. A draft called it the
// "pre-check", which is a coinage: it needs a sentence of explanation before the
// panel can be read, and a title that has to be explained has failed. Every other
// word here is already in the product or in UCP 600.
//
// Told entirely from the system's side. There is deliberately no comparison
// against examiners: this is an assistant that decides nothing, and scoring it
// against the people who sign the work would be both wrong about what it does and
// unusable in the room where it gets shown.
//
// The argument runs in the order it convinces — what you get, what it costs, how
// good it is — and **every number carries a tooltip saying what it measures**.
// An unexplained metric in a governance panel is worse than no metric: someone
// will quote it in a meeting having guessed at its definition.
//
// ---------------------------------------------------------------------------
// **One headline and one or two lines a cell. Nothing else.**
//
// This panel had grown to about twenty-five numbers, which is not a panel — it is a
// report, and a report nobody reads past the first row. The test applied to every
// figure was: *does it move, and does moving it change what somebody does?*
//
// Cut for not moving (structural facts, true this month and next, better stated once
// in the docs than reported daily): the per-model cost bar and its legend, cost per
// page, cost per hundred cases, what caching kept off the bill.
//
// Cut for being volume rather than performance: pages read, cards run, findings
// evidenced. They say the queue was busy, not that the examination was good.
//
// Cut for saying the same thing twice: the "raised, not upheld" count, which is
// precision in another unit and sat directly beneath it; and the slowest-case bar,
// which drew the sentence next to it.
//
// The rule/requirement economics survive as **one line, not two** — a table of them
// in the quality cell was the single densest thing here and its finding compresses
// to a clause: *all three misses are in the judged half*.
// ---------------------------------------------------------------------------
export default function SpendPanel({ spend }) {
  const [open, setOpen] = usePersistedState('lcCheck.spendPanel', true)

  if (!spend) {
    return <div style={{ ...shell, padding: '12px 16px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>Loading…</div>
  }

  const b = spend.benchmark
  const windowHours = b.examinationWindowDays * 24
  const headroom = (1 - b.slowestHoursToDecision / windowHours) * 100

  const q = b.quality.current
  const p = b.quality.previous
  const now = qualityRates(q)
  const then = qualityRates(p)

  // Which half the misses are in, as a clause rather than a table.
  //
  // It is the most decision-relevant fact about quality and it was a four-column
  // grid — the densest thing on the panel for a finding that fits in six words. A
  // Rule card cannot be wrong about its comparison, so a rule that misses or
  // over-raises means a misread field or a mis-authored card: a dictionary job,
  // reproducible, and it stays fixed. A Requirement card is a model reading prose,
  // where the fix is the prompt or accepting the question needs a person.
  // One clause, one separator. "rules missed none" is what "all in requirement
  // cards" already says, and `Count` puts a `·` before the note, so a second one
  // inside it made the line read as three fragments.
  const kinds = q.byKind
  const missedNote = [
    kinds && q.falseNegative
      ? kinds.rule.falseNegative === 0
        ? 'all in requirement cards'
        : `${kinds.rule.falseNegative} in rule cards, ${kinds.requirement.falseNegative} in requirement`
      : null,
    q.falseNegativeNote,
  ].filter(Boolean).join(' — ')

  return (
    <div style={shell}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px',
          background: 'none', border: 'none', borderBottom: open ? '1px solid var(--me-grey-15)' : 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={15} color="var(--me-grey-50)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>AI Performance</span>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{b.period}</span>
        {!open ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)' }}>
            <span>{durationShort(spend.medianWallClock)} to findings</span>
            <span>{usd(spend.avgCostPerCase)} / case</span>
            <span style={{ color: q.falseNegative ? 'var(--status-error)' : 'var(--me-grey)' }}>{q.falseNegative} missed</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(228px,1fr) minmax(228px,1fr) minmax(280px,1.3fr)', gap: 1, background: 'var(--me-grey-15)' }}>
          {/* ---- 1. What you get ---------------------------------------- */}
          <Cell>
            <Eyebrow size="sm">Turnaround</Eyebrow>
            <Big title="Time to findings" tip="Wall-clock time for the automated examination itself: from the file being accepted to every card having returned. Machine time only — it does not include anyone reading the result.">
              {duration(spend.medianWallClock)}
            </Big>
            <Note>median time to findings — a case is decision-ready before it is opened</Note>

            <Rule />
            {/* The one figure here with regulatory teeth: under art. 16(f) a bank
                that misses the window is precluded from calling the documents
                non-compliant at all. The bar that used to sit under this drew the
                same fact the sentence states. */}
            <Line
              label="Presentation to Decision"
              value={`${b.medianHoursToDecision} h`}
              tip="Elapsed time from documents arriving at the counter to the officer's decision being recorded. This is the whole process — queueing, examination and review — not machine time. It is here because UCP 600 art. 14(b) allows five banking days and a missed window forfeits the right to refuse."
              note={`median. Slowest ${b.slowestHoursToDecision} h of the ${windowHours} h art. 14(b) allows — ${percent(headroom)} of the window still free.`}
            />
          </Cell>

          {/* ---- 2. What it costs --------------------------------------- */}
          <Cell>
            <Eyebrow size="sm">Spend</Eyebrow>
            {/* Per case leads and the total is demoted to its note.

                This reverses an earlier call that led with the total because that is
                the number a budget holder gets asked for. The same paragraph
                defending it conceded that a total only ever rises and so cannot show
                a regression — which, on a panel cut to the figures that move,
                decides it. The total is still here, one line down, for whoever needs
                to quote it. */}
            <Big title="Cost per case" tip="Model spend divided by cases examined this period. Watch this rather than the total: a total only ever rises, so it cannot show a regression.">
              {usd(spend.avgCostPerCase)}
            </Big>
            <Note>
              per case · {plural(spend.casesExamined, 'case')} examined · {usd(spend.totalCost)} for the period
            </Note>

            <Rule />
            <Line
              label="Settled Without a Model"
              value={`${spend.freeCardsPerCase} / ${spend.cardsPerCase}`}
              tone="var(--status-success)"
              tip="Rule cards per case: settled by comparing extracted fields, with no model call, no tokens and no cost. They give the same answer every time and, unlike the rest, their cost does not grow with the size of the bundle. The remainder are Requirement cards, which an agent reads — that is the whole of the spend above."
              note={`cards per case settled by comparison — ${percent(spend.freeCardPct)} of the examination, at no cost and identical on every run.`}
            />
          </Cell>

          {/* ---- 3. How good it is -------------------------------------- */}
          <Cell>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Eyebrow size="sm">Quality</Eyebrow>
              {/* The convention, stated once, so no arrow has to be decoded. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--me-grey-50)', whiteSpace: 'nowrap' }}>
                <Icon name="arrow-up" size={9} color="var(--status-success)" />
                better vs {b.previousPeriod}
              </span>
            </div>

            {/* Recall first, not precision, because it is the one to defend: a
                miss can cost the drawing, a false alarm costs minutes. Ordering
                by convention would have put the less important number on top. */}
            <Rate
              label="Recall"
              tip="Of the discrepancies that were really there, the share we caught. Recall = true positives ÷ all real discrepancies. This is the number to defend — a miss can cost the drawing, a false alarm costs minutes."
              value={now.recall}
              previous={then.recall}
              detail={`${q.truePositive} of ${now.actual} real discrepancies caught`}
              emphasise
            />
            <Rate
              label="Precision"
              tip="Of the findings we raised, the share that stood on review. Precision = true positives ÷ everything raised. Low precision means wasted attention, not missed risk."
              value={now.precision}
              previous={then.precision}
              detail={`${q.truePositive} of ${now.raised} raised stood`}
            />

            <Rule />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Count
                label="Missed"
                tip="False negatives — a real discrepancy we did not raise, found downstream. The expensive direction: under UCP 600 art. 16(f) a bank that fails to give notice of refusal in time is precluded from calling the documents non-compliant."
                value={q.falseNegative}
                previous={p.falseNegative}
                lowerIsBetter
                tone={q.falseNegative ? 'var(--status-error)' : 'var(--status-success)'}
                emphasise
                note={missedNote}
              />
              {/* "Raised, not upheld" was here as a count. It is precision in
                  another unit, sitting directly beneath precision — the same fact
                  twice, and precision's own detail line already carries the raw
                  numbers. */}
              <Count
                label="Conditions Covered"
                tip="Share of the conditions in these credits that a card in the dictionary was able to test. The remainder were surfaced as open questions for a person — never passed silently."
                value={q.conditionsCoveredPct}
                previous={p.conditionsCoveredPct}
                suffix="%"
              />
            </div>
          </Cell>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- pieces ----

/**
 * Movement against the previous period.
 *
 * ONE MEANING PER CHANNEL. The arrow points **up when the measure improved** and
 * down when it got worse — never at the raw number's direction — and the colour
 * says the same thing. An earlier version pointed the arrow at the raw movement
 * and coloured it by whether that movement was good, so a falling false-positive
 * count showed a green down-arrow while rising precision showed a green
 * up-arrow. Both were good news and they looked like opposites; the reader had to
 * work out which metric it was before the arrow meant anything.
 *
 * Up is better. Green is better. Always. The raw direction is not lost — the
 * magnitude says "13 fewer" or "2 more", and the previous value is printed
 * beside the current one.
 *
 * `lowerIsBetter` is declared per call site rather than guessed from the label,
 * because getting it wrong is silent and this is the one component where a
 * mistake reverses the meaning of the whole panel.
 */
function Trend({ current, previous, lowerIsBetter = false, kind = 'count', suffix = '' }) {
  if (previous == null) return null
  const diff = current - previous
  const flat = kind === 'rate' ? Math.abs(diff) < 0.0005 : Math.abs(diff) < 0.5
  if (flat) {
    return <span style={{ fontSize: 10.5, color: 'var(--me-grey-50)', whiteSpace: 'nowrap' }}>no change</span>
  }

  const improved = lowerIsBetter ? diff < 0 : diff > 0
  // A percentage already expressed as a whole number moves in points, not in
  // "fewer" — "7% fewer" would read as a relative change it is not.
  const magnitude =
    kind === 'rate'
      ? `${Math.abs(diff * 100).toFixed(1)} pts`
      : kind === 'countPct'
        ? `${Math.abs(diff)} pts`
        : `${Math.abs(diff)}${suffix} ${diff < 0 ? 'fewer' : 'more'}`

  return (
    <span
      title={improved ? 'Better than the previous period' : 'Worse than the previous period'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
        color: improved ? 'var(--status-success)' : 'var(--status-error)',
      }}
    >
      <Icon name={improved ? 'arrow-up' : 'arrow-down'} size={11} />
      {magnitude}
    </span>
  )
}

/** A rate, shown as a percentage with its movement in percentage points. */
function Rate({ label, tip, value, previous, detail, emphasise }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: emphasise ? 20 : 18, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.15 }}>
          {percent(value * 100)}
        </span>
        <span style={{ fontSize: 12, fontWeight: emphasise ? 600 : 400, color: 'var(--me-ink)' }}>
          <InfoTip label={label} title={label}>{tip}</InfoTip>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Trend current={value} previous={previous} kind="rate" />
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>
        {detail} · was {percent(previous * 100)}
      </span>
    </div>
  )
}

/** A count, with its movement stated as "fewer" or "more". */
function Count({ label, tip, value, previous, suffix = '', lowerIsBetter, tone, emphasise, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: emphasise ? 15 : 13, fontWeight: emphasise ? 700 : 400, color: tone || 'var(--me-ink)', flex: '0 0 38px', textAlign: 'right' }}>
        {value}{suffix}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: emphasise ? 600 : 400, color: 'var(--me-ink)' }}>
          <InfoTip label={label} title={label}>{tip}</InfoTip>
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>
          was {previous}{suffix}{note ? ` · ${note}` : ''}
        </span>
      </div>
      <Trend current={value} previous={previous} lowerIsBetter={lowerIsBetter} kind={suffix === '%' ? 'countPct' : 'count'} suffix={suffix} />
    </div>
  )
}

const shell = { ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }

const Cell = ({ children }) => (
  <div style={{ background: '#fff', padding: '13px 16px 15px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
)

const Big = ({ tip, title, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, marginTop: 4 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.2 }}>
      {children}
    </span>
    {tip ? <span style={{ marginTop: 3 }}><InfoTip trigger="icon" title={title}>{tip}</InfoTip></span> : null}
  </span>
)

const Note = ({ children }) => (
  <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', lineHeight: 1.45, marginTop: 2 }}>{children}</span>
)

const Rule = () => <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }} />

const Line = ({ label, value, note, tip, tone }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: tone || 'var(--me-ink)', flex: '0 0 46px' }}>{value}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--me-ink)' }}>
        <InfoTip label={label} title={label}>{tip}</InfoTip>
      </span>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.45 }}>{note}</span>
    </div>
  </div>
)
