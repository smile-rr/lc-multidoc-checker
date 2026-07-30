import { cardSurface } from '@shared/ds/Card'
import { ellipsis } from '@shared/ds/text'
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
export default function SpendPanel({ spend }) {
  const [open, setOpen] = usePersistedState('lcCheck.spendPanel', true)

  if (!spend) {
    return <div style={{ ...shell, padding: '12px 16px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>Loading…</div>
  }

  const b = spend.benchmark
  const windowHours = b.examinationWindowDays * 24
  const headroom = (1 - b.slowestHoursToDecision / windowHours) * 100
  const reusePct = b.documentsRead ? (b.documentsReused / b.documentsRead) * 100 : 0

  const q = b.quality.current
  const p = b.quality.previous
  const now = qualityRates(q)
  const then = qualityRates(p)
  const paid = spend.byModel.filter((m) => m.cost > 0)

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
            <Big title="Time to findings" tip="Wall-clock time for the automated examination itself: from the file being accepted to every check having returned. Machine time only — it does not include anyone reading the result.">
              {duration(spend.medianWallClock)}
            </Big>
            <Note>median time to findings — a case is decision-ready before it is opened</Note>

            <Split>
              <Unit label="pages read" value={String(spend.totalPages)} tip="Bundle pages rendered and read by the vision model across all cases examined this period." />
              <Unit label="cards run" value={String(spend.checksRun)} tip="Rules executed, exact and judged. Excludes rules whose trigger the credit did not meet — those are recorded as not applicable, never as passes." />
              <Unit label="findings" value={String(spend.findingsRaised)} tip="Conclusions returned with quoted evidence and a citation, of every severity — discrepancies, possible discrepancies, clean results and items left for a person." />
            </Split>

            <Rule />
            <Line
              label="Presentation to Decision"
              value={`${b.medianHoursToDecision} h`}
              tip="Elapsed time from documents arriving at the counter to the officer's decision being recorded. This is the whole process — queueing, examination and review — not machine time. It is here because UCP 600 art. 14(b) allows five banking days and a missed window forfeits the right to refuse."
              note={`median. Slowest ${b.slowestHoursToDecision} h against the ${b.examinationWindowDays}-banking-day limit in art. 14(b) — ${percent(headroom)} of the window still free.`}
            />
            <div
              title={`The slowest case this period used ${b.slowestHoursToDecision} h of the ${windowHours} h the rules allow.`}
              style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', marginTop: 8, cursor: 'help' }}
            >
              <div style={{ width: `${(b.slowestHoursToDecision / windowHours) * 100}%`, background: 'var(--me-blue)' }} />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', marginTop: 4 }}>
              slowest case against the {b.examinationWindowDays}-day window
            </span>
          </Cell>

          {/* ---- 2. What it costs --------------------------------------- */}
          <Cell>
            <Eyebrow size="sm">Spend</Eyebrow>
            <Big title="Spend" tip="Total model spend for every case examined this period, priced per model at its own input and output rates.">
              {usd(spend.totalCost)}
            </Big>
            <Note>total for the period · {plural(spend.casesExamined, 'case')} checked · {spend.totalPages} pages</Note>

            <Split>
              <Unit label="per case" value={usd(spend.avgCostPerCase)} tip="Total divided by cases examined. Watch this rather than the total: a total only ever rises, so it cannot show a regression." />
              <Unit label="per page" value={usd(spend.avgCostPerPage)} tip="Total divided by pages read. The fairest unit to compare bundles of different sizes." />
              <Unit label="per 100" value={usd(spend.avgCostPerCase * 100)} tip="Cost per hundred cases, at the current rate. A scale-free figure to budget and forecast with." />
            </Split>

            {/* Only what costs something. The engine that settles the rule cards is
                in `byModel` because it did work, but a 0% slice is an invisible bar
                and a 0% legend row reads as a model that failed to report. Its
                contribution is stated as a sentence below instead, which is the more
                interesting form anyway. */}
            <Bar models={paid} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              {paid.map((m) => (
                <div
                  key={m.modelId}
                  title={`${m.label} — ${m.role}. ${percent(m.costShare * 100)} of spend, ${usd(m.cost)}.`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, cursor: 'help' }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: modelColour(m.modelId), flexShrink: 0 }} />
                  <span style={{ color: 'var(--me-grey)', flex: 1, minWidth: 0, ...ellipsis }}>{m.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--me-grey-70)' }}>{percent(m.costShare * 100)}</span>
                </div>
              ))}
            </div>

            <Rule />
            <Line
              label="Settled Without a Model"
              value={`${spend.freeCardsPerCase} / ${spend.cardsPerCase}`}
              tone="var(--status-success)"
              tip="Exact rules per case: settled by an expression over extracted fields, with no model call, no tokens and no cost. They give the same answer every time and their cost does not grow with the size of the bundle. The rest are judged rules, which an agent reads — that is the whole of the spend above."
              note={`cards per case settled by comparison — ${percent(spend.freeCardPct)} of the examination, at no cost and identical on every run.`}
            />
            <Line
              label="Kept off the Bill"
              value={usd(spend.costAvoided)}
              tone="var(--status-success)"
              tip="Money not spent because work was reused: documents already read are served from the extract cache without re-rendering or re-calling the model, and repeated prompt context is billed at a fraction of full rate. Derived from the same usage as the spend above, so the two reconcile."
              note={`${b.documentsReused} of ${b.documentsRead} documents served from cache, ${percent(spend.cachedInputPct)} of input tokens reused — ${percent(reusePct)} of the reading not repeated.`}
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
                note={q.falseNegativeNote}
              />
              <Count
                label="Raised, Not Upheld"
                tip="False positives. We flagged it, review set it aside. Costs an officer attention but nothing else."
                value={q.falsePositive}
                previous={p.falsePositive}
                lowerIsBetter
                note={`most often ${q.falsePositiveTopCause}`}
              />
              <Count
                label="Conditions Covered"
                tip="Share of the conditions in these credits that a card in the dictionary was able to test. The remainder were surfaced as open questions for a person — never passed silently."
                value={q.conditionsCoveredPct}
                previous={p.conditionsCoveredPct}
                suffix="%"
              />
            </div>

            {/* Which half the errors are in — the question that decides what to do
                about them. An exact rule cannot be wrong about its comparison, so
                when one does not stand it is the extraction or the authoring: a
                dictionary job, reproducible, and it stays fixed. A judged rule is a
                model reading prose, where the fix is the prompt or accepting that the
                question needs a person. One blended rate hides which conversation to
                have. */}
            {q.byKind ? <KindSplit current={q.byKind} previous={p.byKind} /> : null}
          </Cell>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- pieces ----

/**
 * Errors by card kind.
 *
 * Deliberately not two more precision/recall pairs — that would double the rates on
 * the panel and invite someone to quote whichever is higher. Three counts each, in
 * the columns that matter: what stood, what did not, and what was missed.
 */
function KindSplit({ current, previous }) {
  const rows = [
    { key: 'exact', label: 'Exact rules', icon: 'equal', colour: 'var(--me-blue-deep)', tip: 'Rules settled by an expression over extracted fields. Deterministic — the comparison cannot be wrong, so a finding that does not stand means a misread field or a mis-authored rule.' },
    { key: 'judged', label: 'Judged rules', icon: 'list-checks', colour: '#1F7A00', tip: 'Rules an agent reads and forms a view on. Where judgement lives, and where the misses are.' },
  ]
  return (
    <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 42px 42px 42px', gap: 6, fontSize: 10, color: 'var(--me-grey-50)' }}>
        <span>by tier</span>
        <span style={{ textAlign: 'right' }} title="Findings that stood on review">stood</span>
        <span style={{ textAlign: 'right' }} title="Raised, then set aside on review">set aside</span>
        <span style={{ textAlign: 'right' }} title="Real discrepancies not raised, found downstream">missed</span>
      </div>
      {rows.map((r) => {
        const c = current[r.key]
        const was = previous?.[r.key]
        if (!c) return null
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 42px 42px 42px', gap: 6, alignItems: 'baseline' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11.5, color: 'var(--me-ink)' }}>
                <span style={{ display: 'flex', flexShrink: 0, color: r.colour }}><Icon name={r.icon} size={11} color="currentColor" /></span>
                <span style={{ minWidth: 0, ...ellipsis }}>
                  <InfoTip label={r.label} title={r.label}>{r.tip}</InfoTip>
                </span>
              </span>
              <Num value={c.truePositive} />
              <Num value={c.falsePositive} was={was?.falsePositive} />
              <Num value={c.falseNegative} was={was?.falseNegative} tone={c.falseNegative ? 'var(--status-error)' : 'var(--status-success)'} />
            </div>
            {c.cause ? (
              <span style={{ fontSize: 10, color: 'var(--me-grey-70)', paddingLeft: 16, lineHeight: 1.4 }}>{c.cause}</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

const Num = ({ value, was, tone }) => (
  <span
    title={was == null ? undefined : `was ${was} in the previous period`}
    style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: tone || 'var(--me-ink)', textAlign: 'right', cursor: was == null ? 'default' : 'help' }}
  >
    {value}
  </span>
)

// One colour per model, in the order the cost roll-up returns them.
const PALETTE = ['var(--me-blue)', 'var(--me-green)', 'var(--me-navy)', 'var(--me-blue-50)']
const ORDER = new Map()
const modelColour = (id) => {
  if (!ORDER.has(id)) ORDER.set(id, ORDER.size)
  return PALETTE[ORDER.get(id) % PALETTE.length]
}

function Bar({ models }) {
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', marginTop: 12 }}>
      {models.map((m) => (
        <div key={m.modelId} title={`${m.label} — ${percent(m.costShare * 100)}`} style={{ width: `${m.costShare * 100}%`, background: modelColour(m.modelId) }} />
      ))}
    </div>
  )
}

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

const Split = ({ children }) => (
  <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }}>{children}</div>
)

const Rule = () => <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }} />

const Unit = ({ label, value, tip }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--me-ink)', whiteSpace: 'nowrap' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>
      <InfoTip label={label} title={label}>{tip}</InfoTip>
    </span>
  </div>
)

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
