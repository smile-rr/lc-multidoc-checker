import Icon from '@shared/ds/Icon'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { duration, durationShort, usd, percent, plural } from '@shared/lib/format'

// How the automated examination is performing, across the queue.
//
// Titled "AI performance" and nothing cleverer. An earlier draft called it the
// "pre-check", which is a coinage: it needs a sentence of explanation before
// anyone can read the panel, and a title that has to be explained is a title that
// has failed. Every other word here is already in the product or in UCP 600.
//
// Told entirely from the system's side. There is deliberately no comparison
// against examiners anywhere: this is an assistant that decides nothing, and
// scoring it against the people who sign the work would be both wrong about what
// it does and unusable in the room where it gets shown. It also rested on an
// estimate of how long review takes, which is the least reliable number
// available and was carrying the entire claim.
//
// So the argument runs in the order it convinces: what you get, what it costs,
// how good it is.
//
//   1 TURNAROUND — a case is decision-ready before anyone opens it, and there is
//     room left in the five banking days art. 14(b) allows. Headroom, not raw
//     speed: pace stops being worth anything once the window is comfortable.
//   2 SPEND — the total leads and is labelled as one, because that is the number
//     a budget holder is asked for. Unit costs sit under it so a change is
//     visible (a total only ever rises), and a per-100-cases rate makes it
//     scale-free enough to forecast with.
//   3 QUALITY — split by direction, because a false alarm costs effort and a miss
//     can cost the drawing.
export default function SpendPanel({ spend }) {
  const [open, setOpen] = usePersistedState('lcCheck.spendPanel', true)

  if (!spend) {
    return <div style={{ ...shell, padding: '12px 16px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>Loading…</div>
  }

  const b = spend.benchmark
  const windowHours = b.examinationWindowDays * 24
  const headroom = (1 - b.slowestHoursToDecision / windowHours) * 100
  const reusePct = b.documentsRead ? (b.documentsReused / b.documentsRead) * 100 : 0

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
            <span style={{ color: b.missed ? 'var(--status-warning)' : 'var(--me-grey)' }}>{b.missed} missed</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: 1, background: 'var(--me-grey-15)' }}>
          {/* ---- 1. What you get ---------------------------------------- */}
          <Cell>
            <Eyebrow>Turnaround</Eyebrow>
            <Big>{duration(spend.medianWallClock)}</Big>
            <Note>median time to findings — a case is decision-ready before it is opened</Note>

            <Split>
              <Unit label="pages read" value={String(spend.totalPages)} />
              <Unit label="checks run" value={String(spend.checksRun)} />
              <Unit label="findings evidenced" value={String(spend.findingsRaised)} />
            </Split>

            <Rule />
            <Line
              label="Presentation to decision"
              value={`${b.medianHoursToDecision} h`}
              note={`median. Slowest ${b.slowestHoursToDecision} h against the ${b.examinationWindowDays}-banking-day limit in UCP 600 art. 14(b) — ${percent(headroom)} of the window still free.`}
            />
            <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', marginTop: 8 }}>
              <div title={`Slowest case used ${b.slowestHoursToDecision} h`} style={{ width: `${(b.slowestHoursToDecision / windowHours) * 100}%`, background: 'var(--me-blue)' }} />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', marginTop: 4 }}>
              slowest case against the {b.examinationWindowDays}-day window
            </span>
          </Cell>

          {/* ---- 2. What it costs --------------------------------------- */}
          <Cell>
            <Eyebrow>Spend</Eyebrow>
            <Big>{usd(spend.totalCost)}</Big>
            <Note>total for the period · {plural(spend.casesExamined, 'case')} checked · {spend.totalPages} pages</Note>

            {/* Unit costs sit under the total because a total only ever rises and
                so cannot show a regression; and a per-100 rate because that is
                what a budget conversation is actually held in. */}
            <Split>
              <Unit label="per case" value={usd(spend.avgCostPerCase)} />
              <Unit label="per page" value={usd(spend.avgCostPerPage)} />
              <Unit label="per 100 cases" value={usd(spend.avgCostPerCase * 100)} />
            </Split>

            <Bar models={spend.byModel} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              {spend.byModel.map((m) => (
                <div key={m.modelId} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
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
              note={`${b.documentsReused} of ${b.documentsRead} documents served from the extract cache without re-reading, and ${percent(spend.cachedInputPct)} of input tokens reused — ${percent(reusePct)} of the work was not repeated.`}
            />
          </Cell>

          {/* ---- 3. How good it is -------------------------------------- */}
          <Cell>
            <Eyebrow>Quality</Eyebrow>
            <Big>{percent((b.upheld / b.findingsReviewed) * 100)}</Big>
            <Note>{b.upheld} of {b.findingsReviewed} findings upheld on review</Note>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
              <Line
                label="Raised, not upheld"
                value={String(b.overturned)}
                tone="var(--status-warning)"
                note={`flagged and then set aside on review — costs attention. Most often ${b.overturnedTopCause}.`}
              />
              <Line
                label="Missed"
                value={String(b.missed)}
                tone={b.missed ? 'var(--status-error)' : 'var(--status-success)'}
                emphasise
                note={
                  b.missed
                    ? `surfaced downstream rather than by the check run — ${b.missedNote}. This is the direction that costs money: under art. 16(f) a refusal window missed is a refusal right lost.`
                    : 'nothing surfaced downstream that the check run did not raise.'
                }
              />
            </div>

            <Rule />
            <Line
              label="Conditions covered"
              value={`${b.conditionsCoveredPct}%`}
              note={`a rule existed for ${b.conditionsCoveredPct}% of the conditions in these credits. The remainder were surfaced as open questions, never passed silently.`}
            />
          </Cell>
        </div>
      ) : null}
    </div>
  )
}

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

const shell = { background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, overflow: 'hidden' }

const Cell = ({ children }) => (
  <div style={{ background: '#fff', padding: '13px 16px 15px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
)

const Eyebrow = ({ children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{children}</span>
)

const Big = ({ children }) => (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.2, marginTop: 4 }}>{children}</span>
)

const Note = ({ children }) => (
  <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', lineHeight: 1.45, marginTop: 2 }}>{children}</span>
)

const Split = ({ children }) => (
  <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }}>{children}</div>
)

const Rule = () => <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }} />

const Unit = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--me-ink)', whiteSpace: 'nowrap' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{label}</span>
  </div>
)

const Line = ({ label, value, note, tone, emphasise }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: emphasise ? 15 : 13.5, fontWeight: emphasise ? 700 : 400, color: tone || 'var(--me-ink)', flex: '0 0 46px' }}>
      {value}
    </span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: emphasise ? 600 : 400, color: 'var(--me-ink)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.45 }}>{note}</span>
    </div>
  </div>
)
