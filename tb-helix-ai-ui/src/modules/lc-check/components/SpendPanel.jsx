import Icon from '@shared/ds/Icon'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { seconds, usd, percent, plural } from '@shared/lib/format'

// AI spend across the whole queue.
//
// The per-case drawer answers "what did this one cost". This answers the question
// a team lead actually has, which is a different question: what is this costing
// us, is it stable, where does it go, and is it worth it.
//
// Three decisions worth keeping:
//
//   · **Per case and per page, not just a total.** A total only ever goes up, so
//     it tells you nothing about whether anything changed. The unit costs are what
//     you would notice a regression in.
//
//   · **The benchmark is on the same row as the cost.** A number like $1.07 is not
//     a decision until it sits next to the 45 minutes of examiner time it replaced
//     and the 92% of the time a checker agreed with us. The agreement rate matters
//     more than the money: a cheap review that gets overturned is not cheap.
//
//   · **Collapsed is remembered.** An examiner working a queue does not need this
//     every day; the lead who does need it wants it on every visit.
export default function SpendPanel({ spend }) {
  const [open, setOpen] = usePersistedState('lcCheck.spendPanel', true)

  if (!spend) {
    return (
      <div style={{ ...shell, padding: '12px 16px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>
        Loading spend…
      </div>
    )
  }

  const b = spend.benchmark
  const manualHours = (spend.casesExamined * b.manualMinutesPerCase) / 60
  const aiMinutes = (spend.casesExamined * spend.medianWallClock) / 60

  return (
    <div style={shell}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '11px 16px',
          background: 'none',
          border: 'none',
          borderBottom: open ? '1px solid var(--me-grey-15)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={15} color="var(--me-grey-50)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>AI spend</span>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{b.period}</span>

        {/* Collapsed, the two numbers that matter still show. */}
        {!open ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)' }}>
            <span>{usd(spend.totalCost)} total</span>
            <span>{usd(spend.avgCostPerCase)} / case</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1fr) minmax(210px,1fr) minmax(240px,1.1fr)', gap: 1, background: 'var(--me-grey-15)' }}>
          <Cell>
            <Eyebrow>Spend</Eyebrow>
            <Big>{usd(spend.totalCost)}</Big>
            <Note>{plural(spend.casesExamined, 'case')} examined of {spend.casesTotal} · {spend.totalPages} pages</Note>
            <Split>
              <Unit label="per case" value={usd(spend.avgCostPerCase)} />
              <Unit label="per page" value={usd(spend.avgCostPerPage)} />
            </Split>
          </Cell>

          <Cell>
            <Eyebrow>Where it goes</Eyebrow>
            <Bar models={spend.byModel} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
              {spend.byModel.map((m) => (
                <div key={m.modelId} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: modelColour(m.modelId), flexShrink: 0 }} />
                  <span style={{ color: 'var(--me-ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>{percent(m.costShare * 100)}</span>
                </div>
              ))}
            </div>
          </Cell>

          <Cell>
            <Eyebrow>Against the alternative</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
              <Compare
                label="Examiner time replaced"
                value={`${manualHours.toFixed(0)} h`}
                note={`${b.manualMinutesPerCase} min per case by hand · ${aiMinutes.toFixed(0)} min of machine time`}
              />
              <Compare
                label="Checkers agreed with us"
                value={`${b.checkerAgreementPct}%`}
                note={`${b.findingsReviewed} findings reviewed · ${b.overturned} overturned, mostly ${b.overturnedTopCause}`}
                tone={b.checkerAgreementPct >= 90 ? 'var(--status-success)' : 'var(--status-warning)'}
              />
              <Compare label="Median run" value={seconds(spend.medianWallClock)} note="wall clock, per case" />
            </div>
          </Cell>
        </div>
      ) : null}
    </div>
  )
}

// One colour per model, matching the order the cost roll-up returns.
const PALETTE = ['var(--me-blue)', 'var(--me-green)', 'var(--me-navy)', 'var(--me-blue-50)']
const ORDER = new Map()
const modelColour = (id) => {
  if (!ORDER.has(id)) ORDER.set(id, ORDER.size)
  return PALETTE[ORDER.get(id) % PALETTE.length]
}

function Bar({ models }) {
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', marginTop: 6 }}>
      {models.map((m) => (
        <div
          key={m.modelId}
          title={`${m.label} — ${percent(m.costShare * 100)}`}
          style={{ width: `${m.costShare * 100}%`, background: modelColour(m.modelId) }}
        />
      ))}
    </div>
  )
}

const shell = {
  background: '#fff',
  border: '1px solid var(--me-grey-15)',
  borderRadius: 12,
  overflow: 'hidden',
}

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

const Unit = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--me-ink)' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{label}</span>
  </div>
)

const Compare = ({ label, value, note, tone }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: tone || 'var(--me-ink)', flex: '0 0 52px' }}>{value}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--me-ink)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{note}</span>
    </div>
  </div>
)
