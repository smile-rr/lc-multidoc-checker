import Icon from '@shared/ds/Icon'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { seconds, usd, percent, plural } from '@shared/lib/format'

// What the AI is costing, saving and getting right, across the queue.
//
// The per-case drawer answers "what did this one cost". This answers what a team
// lead has to defend: is it worth it. Three columns, three questions — money,
// time, quality — because they are separate arguments and a reader needs to be
// able to lose one and keep the others.
//
// Framing decisions that matter more than the layout:
//
//   · **Handling time, not machine time.** "45 minutes by hand versus 16 seconds"
//     is a ratio nobody can staff against. The officer still reads every finding
//     and signs; what changed is the *total* per case. Machine time is shown, but
//     as a component, not as the headline.
//
//   · **Two failure directions, never one accuracy number.** A false alarm costs
//     minutes. A miss can cost the drawing — UCP 600 art. 16(f) precludes a bank
//     that misses its refusal window from calling the documents non-compliant.
//     Averaging them hides the only one that can hurt you, so misses get their
//     own line and their own colour.
//
//   · **Turnaround against the rule.** Art. 14(b) allows five banking days. Speed
//     is worth something up to the point the window is comfortable and nothing
//     after, so the figure is headroom, not raw speed.
export default function SpendPanel({ spend }) {
  const [open, setOpen] = usePersistedState('lcCheck.spendPanel', true)

  if (!spend) {
    return <div style={{ ...shell, padding: '12px 16px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>Loading…</div>
  }

  const b = spend.benchmark
  const machineMinutes = spend.medianWallClock / 60
  const afterMinutes = b.officerMinutesPerCase + machineMinutes
  const savedMinutes = b.manualMinutesPerCase - afterMinutes
  const savedPct = (savedMinutes / b.manualMinutesPerCase) * 100
  const hoursSaved = (savedMinutes * spend.casesExamined) / 60
  const windowHours = b.examinationWindowDays * 24

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
            <span>{usd(spend.avgCostPerCase)} / case</span>
            <span>{afterMinutes.toFixed(0)} min / case</span>
            <span style={{ color: b.missed ? 'var(--status-warning)' : 'var(--me-grey)' }}>{b.missed} missed</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: 1, background: 'var(--me-grey-15)' }}>
          {/* ---- Money ------------------------------------------------- */}
          <Cell>
            <Eyebrow>Spend</Eyebrow>
            <Big>{usd(spend.totalCost)}</Big>
            <Note>{plural(spend.casesExamined, 'case')} examined · {spend.totalPages} pages</Note>
            <Split>
              <Unit label="per case" value={usd(spend.avgCostPerCase)} />
              <Unit label="per page" value={usd(spend.avgCostPerPage)} />
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
          </Cell>

          {/* ---- Time. The officer is in the number, deliberately. ------ */}
          <Cell>
            <Eyebrow>Time per case</Eyebrow>
            <Big>{afterMinutes.toFixed(0)} min</Big>
            <Note>
              was {b.manualMinutesPerCase} min unaided — {savedMinutes.toFixed(0)} min saved, {percent(savedPct)} less
            </Note>

            {/* The bar shows what the time is made of, so nobody reads the
                saving as the machine having replaced the examiner. */}
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', marginTop: 10 }}>
              <div title={`Officer review ${b.officerMinutesPerCase} min`} style={{ width: `${(b.officerMinutesPerCase / b.manualMinutesPerCase) * 100}%`, background: 'var(--me-blue)' }} />
              <div title={`Machine ${seconds(spend.medianWallClock)}`} style={{ width: `${Math.max(1.5, (machineMinutes / b.manualMinutesPerCase) * 100)}%`, background: 'var(--me-green)' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 11, color: 'var(--me-grey-70)' }}>
              <Legend colour="var(--me-blue)">officer {b.officerMinutesPerCase} min</Legend>
              <Legend colour="var(--me-green)">machine {seconds(spend.medianWallClock)}</Legend>
            </div>

            <Split>
              <Unit label="cases / examiner-day" value={`${b.casesPerExaminerDayBefore} → ${b.casesPerExaminerDayAfter}`} />
              <Unit label="examiner-hours saved" value={`${hoursSaved.toFixed(0)} h`} />
            </Split>

            <Rule />
            <Line
              label="Decision turnaround"
              value={`${b.medianDecisionHours} h`}
              note={`median, against the ${b.examinationWindowDays}-banking-day limit in UCP 600 art. 14(b). Slowest ${b.slowestDecisionHours} h — ${percent((1 - b.slowestDecisionHours / windowHours) * 100)} headroom.`}
            />
          </Cell>

          {/* ---- Quality. Split by direction; a miss is not a false alarm. */}
          <Cell>
            <Eyebrow>Quality</Eyebrow>
            <Big>{percent((b.upheld / b.findingsReviewed) * 100)}</Big>
            <Note>{b.upheld} of {b.findingsReviewed} findings upheld by a checker</Note>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
              <Line
                label="False alarms"
                value={String(b.overturned)}
                tone="var(--status-warning)"
                note={`raised, checker disagreed — costs review time. Most often ${b.overturnedTopCause}.`}
              />
              <Line
                label="Missed"
                value={String(b.missed)}
                tone={b.missed ? 'var(--status-error)' : 'var(--status-success)'}
                emphasise
                note={
                  b.missed
                    ? `found downstream, not by us — ${b.missedNote}. This is the direction that costs money: under art. 16(f) a bank that misses its refusal window must pay.`
                    : 'nothing found downstream that we did not raise.'
                }
              />
            </div>

            <Rule />
            <Line
              label="Conditions covered"
              value={`${b.conditionsCoveredPct}%`}
              note={`a rule existed for ${b.conditionsCoveredPct}% of the conditions in these credits. The rest were surfaced for a person, not passed.`}
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
  <div style={{ display: 'flex', gap: 18, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }}>{children}</div>
)

const Rule = () => <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--me-grey-08)' }} />

const Unit = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--me-ink)', whiteSpace: 'nowrap' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{label}</span>
  </div>
)

const Legend = ({ colour, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 7, height: 7, borderRadius: 2, background: colour }} />
    {children}
  </span>
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
