import Icon from '@shared/ds/Icon'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { duration, durationShort, usd, percent, plural } from '@shared/lib/format'
import { qualityRates } from '../data/fixtures.js'

// How the automated examination is performing, across the queue.
//
// Titled "AI performance" and nothing cleverer. A draft called it the
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
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>AI performance</span>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{b.period}</span>
        {!open ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)' }}>
            <span>{durationShort(spend.medianWallClock)} to findings</span>
            <span>{usd(spend.avgCostPerCase)} / case</span>
            <span style={{ color: q.falseNegative ? 'var(--status-warning)' : 'var(--me-grey)' }}>{q.falseNegative} missed</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(228px,1fr) minmax(228px,1fr) minmax(280px,1.3fr)', gap: 1, background: 'var(--me-grey-15)' }}>
          {/* ---- 1. What you get ---------------------------------------- */}
          <Cell>
            <Eyebrow>Turnaround</Eyebrow>
            <Big tip="Wall-clock time for the automated examination itself: from the file being accepted to every check having returned. Machine time only — it does not include anyone reading the result.">
              {duration(spend.medianWallClock)}
            </Big>
            <Note>median time to findings — a case is decision-ready before it is opened</Note>

            <Split>
              <Unit label="pages read" value={String(spend.totalPages)} tip="Bundle pages rendered and read by the vision model across all cases examined this period." />
              <Unit label="checks run" value={String(spend.checksRun)} tip="Rule checks executed. Excludes checks whose trigger the credit did not meet — those are recorded as not applicable, not as passes." />
              <Unit label="findings" value={String(spend.findingsRaised)} tip="Conclusions returned with quoted evidence and a citation, of every severity — discrepancies, possible discrepancies, clean results and items left for a person." />
            </Split>

            <Rule />
            <Line
              label="Presentation to decision"
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
            <Eyebrow>Spend</Eyebrow>
            <Big tip="Total model spend for every case examined this period, priced per model at its own input and output rates.">
              {usd(spend.totalCost)}
            </Big>
            <Note>total for the period · {plural(spend.casesExamined, 'case')} checked · {spend.totalPages} pages</Note>

            <Split>
              <Unit label="per case" value={usd(spend.avgCostPerCase)} tip="Total divided by cases examined. Watch this rather than the total: a total only ever rises, so it cannot show a regression." />
              <Unit label="per page" value={usd(spend.avgCostPerPage)} tip="Total divided by pages read. The fairest unit to compare bundles of different sizes." />
              <Unit label="per 100" value={usd(spend.avgCostPerCase * 100)} tip="Cost per hundred cases, at the current rate. A scale-free figure to budget and forecast with." />
            </Split>

            <Bar models={spend.byModel} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              {spend.byModel.map((m) => (
                <div
                  key={m.modelId}
                  title={`${m.label} — ${m.role}. ${percent(m.costShare * 100)} of spend, ${usd(m.cost)}.`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, cursor: 'help' }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: modelColour(m.modelId), flexShrink: 0 }} />
                  <span style={{ color: 'var(--me-grey)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--me-grey-70)' }}>{percent(m.costShare * 100)}</span>
                </div>
              ))}
            </div>

            <Rule />
            <Line
              label="Kept off the bill"
              value={usd(spend.costAvoided)}
              tone="var(--status-success)"
              tip="Money not spent because work was reused: documents already read are served from the extract cache without re-rendering or re-calling the model, and repeated prompt context is billed at a fraction of full rate. Derived from the same usage as the spend above, so the two reconcile."
              note={`${b.documentsReused} of ${b.documentsRead} documents served from cache, ${percent(spend.cachedInputPct)} of input tokens reused — ${percent(reusePct)} of the reading not repeated.`}
            />
          </Cell>

          {/* ---- 3. How good it is -------------------------------------- */}
          <Cell>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Eyebrow>Quality</Eyebrow>
              <span style={{ fontSize: 10.5, color: 'var(--me-grey-50)' }}>vs {b.previousPeriod}</span>
            </div>

            {/* Precision and recall, not "accuracy". Accuracy would include every
                check that correctly found nothing — thousands of them — and read
                99.8% while missing three real discrepancies. */}
            <Rate
              label="Precision"
              tip="Of the findings we raised, the share that stood on review. Precision = true positives ÷ everything raised. Low precision means wasted attention."
              value={now.precision}
              previous={then.precision}
              detail={`${q.truePositive} of ${now.raised} raised stood`}
            />
            <Rate
              label="Recall"
              tip="Of the discrepancies that were really there, the share we caught. Recall = true positives ÷ all real discrepancies. This is the number to defend: a miss can cost the drawing, a false alarm costs minutes."
              value={now.recall}
              previous={then.recall}
              detail={`${q.truePositive} of ${now.actual} real discrepancies caught`}
              emphasise
            />

            <Rule />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Count
                label="Raised, not upheld"
                tip="False positives. We flagged it, review set it aside. Costs an officer attention but nothing else."
                value={q.falsePositive}
                previous={p.falsePositive}
                lowerIsBetter
                note={`most often ${q.falsePositiveTopCause}`}
              />
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
                label="Conditions covered"
                tip="Share of the conditions in these credits that a rule in the dictionary was able to test. The remainder were surfaced as open questions for a person — never passed silently."
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
 * `lowerIsBetter` inverts the colour, because a falling false-positive count is
 * good news and a falling recall is not. Getting that backwards would be worse
 * than showing no trend at all.
 */
function Delta({ value, unit = '', lowerIsBetter = false, decimals = 0 }) {
  if (value == null || Math.abs(value) < 0.05) {
    return <span style={{ fontSize: 10.5, color: 'var(--me-grey-50)', whiteSpace: 'nowrap' }}>no change</span>
  }
  const up = value > 0
  const good = lowerIsBetter ? !up : up
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap', color: good ? 'var(--status-success)' : 'var(--status-warning)' }}
    >
      <Icon name={up ? 'arrow-up-right' : 'arrow-down-right'} size={11} />
      {Math.abs(value).toFixed(decimals)}{unit}
    </span>
  )
}

/** A rate shown as a percentage, with its movement in percentage points. */
function Rate({ label, tip, value, previous, detail, emphasise }) {
  const pts = (value - previous) * 100
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: emphasise ? 20 : 18, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.15 }}>
          {percent(value * 100)}
        </span>
        <Tip text={tip}>
          <span style={{ fontSize: 12, fontWeight: emphasise ? 600 : 400, color: 'var(--me-ink)' }}>{label}</span>
        </Tip>
        <span style={{ marginLeft: 'auto' }}><Delta value={pts} unit=" pts" decimals={1} /></span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{detail}</span>
    </div>
  )
}

/** A count, with its movement as an absolute change. */
function Count({ label, tip, value, previous, suffix = '', lowerIsBetter, tone, emphasise, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: emphasise ? 15 : 13, fontWeight: emphasise ? 700 : 400, color: tone || 'var(--me-ink)', flex: '0 0 38px', textAlign: 'right' }}>
        {value}{suffix}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
        <Tip text={tip}>
          <span style={{ fontSize: 12, fontWeight: emphasise ? 600 : 400, color: 'var(--me-ink)' }}>{label}</span>
        </Tip>
        {note ? <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{note}</span> : null}
      </div>
      <Delta value={value - previous} unit={suffix ? ' pts' : ''} lowerIsBetter={lowerIsBetter} />
    </div>
  )
}

/**
 * Marks a label as having an explanation behind it.
 *
 * A dotted underline rather than a row of (i) icons: in a grid this dense, twelve
 * icons would be more chrome than data, and the underline signals "there is more
 * here" without occupying a column.
 */
const Tip = ({ text, children }) => (
  <span title={text} style={{ cursor: 'help', borderBottom: '1px dotted var(--me-grey-50)' }}>
    {children}
  </span>
)

const shell = { background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, overflow: 'hidden' }

const Cell = ({ children }) => (
  <div style={{ background: '#fff', padding: '13px 16px 15px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
)

const Eyebrow = ({ children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{children}</span>
)

const Big = ({ tip, children }) => (
  <span title={tip} style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.2, marginTop: 4, cursor: tip ? 'help' : 'default', alignSelf: 'flex-start' }}>
    {children}
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
    <Tip text={tip}>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{label}</span>
    </Tip>
  </div>
)

const Line = ({ label, value, note, tip, tone }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: tone || 'var(--me-ink)', flex: '0 0 46px' }}>{value}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Tip text={tip}>
        <span style={{ fontSize: 12, color: 'var(--me-ink)' }}>{label}</span>
      </Tip>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.45 }}>{note}</span>
    </div>
  </div>
)
