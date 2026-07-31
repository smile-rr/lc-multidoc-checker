import { cardSurface } from '@shared/ds/Card'
import { ellipsis } from '@shared/ds/text'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Badge from '@shared/ds/Badge'
import Button from '@shared/ds/Button'
import { money, dueLabel, plural } from '@shared/lib/format'
import * as api from '../api/lcCheckApi'
import { flowDisagreements } from '../state/severity'
import NewCheckModal from '../components/NewCheckModal'
import SpendPanel from '../components/SpendPanel'

const STATUS_TONE = {
  awaiting_check: 'neutral',
  running: 'blue',
  discrepancies: 'error',
  to_decide: 'warning',
  clean: 'green',
  with_authoriser: 'blue',
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'due', label: 'Due Today' },
]

const COLS = '148px 108px minmax(200px,1fr) 148px 96px 132px 104px'

export default function CasesScreen() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState(null)
  const [spend, setSpend] = useState(null)
  const [newOpen, setNewOpen] = useState(false)

  // The service's own description of the pipeline, checked against ours. Loaded
  // here because the cases list is the one screen everybody passes through, and a
  // drift warning is worth nothing if it only fires on a screen nobody opens.
  useEffect(() => {
    let alive = true
    api.getFlow().then((flow) => {
      if (!alive) return
      const problems = flowDisagreements(flow)
      if (problems.length) {
        console.warn('[helix] the run bar and the service disagree about the pipeline:\n  - ' +
          problems.join('\n  - '))
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Loaded once, not per filter: the spend is portfolio-wide and does not change
  // because the officer narrowed the list.
  useEffect(() => {
    let alive = true
    api.getSpendSummary().then((s) => { if (alive) setSpend(s) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    api.listCases({ scope: filter }).then((r) => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [filter])

  const dueToday = (rows ?? []).filter((r) => r.replyDueDays === 0).length

  return (
    <section className="helix-screen" style={{ padding: '26px 32px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--me-ink)' }}>Cases</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>
            {rows ? `${plural(rows.length, 'open case')} · ${dueToday} due today` : 'Loading…'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          {FILTERS.map((f) => {
            const on = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-20)'}`,
                  background: on ? 'var(--me-blue-20)' : '#fff',
                  color: on ? 'var(--me-blue-deep)' : 'var(--me-grey)',
                }}
              >
                {f.label}
              </button>
            )
          })}
          <Button onClick={() => setNewOpen(true)}>New check</Button>
        </div>
      </div>

      <SpendPanel spend={spend} />

      <div style={{ ...cardSurface(12), boxShadow: 'none', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 14px', padding: '10px 20px', background: 'var(--me-grey-08)', fontSize: 11.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--me-grey-70)', minWidth: 1000 }}>
          <span>Check</span>
          <span>Credit</span>
          <span>Beneficiary</span>
          <span style={{ textAlign: 'right' }}>Amount</span>
          <span style={{ textAlign: 'right' }}>Pages</span>
          <span>Status</span>
          <span style={{ textAlign: 'right' }}>Reply Due</span>
        </div>

        {rows === null ? (
          <div style={{ padding: '16px 20px' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 10, borderRadius: 3, background: 'var(--me-grey-08)', margin: '14px 0' }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 20px', fontSize: 13, color: 'var(--me-grey-70)' }}>Nothing matches that filter.</div>
        ) : (
          rows.map((r) => {
            const urgent = r.replyDueDays === 0
            return (
              <div
                key={r.id}
                onClick={() => navigate(`/lc-check/cases/${r.id}/intake`)}
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 14px', padding: '13px 20px', borderBottom: '1px solid var(--me-grey-08)', fontSize: 13, alignItems: 'center', cursor: 'pointer', minWidth: 1000 }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-ink)' }}>{r.id}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey-70)' }}>{r.creditRef}</span>
                <span style={{ color: 'var(--me-ink)', ...ellipsis }}>{r.beneficiary}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--me-ink)' }}>{money(r.currency, r.amount)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey-70)' }}>{r.pageCount}</span>
                <span><Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.statusLabel}</Badge></span>
                <span style={{ textAlign: 'right', fontSize: 12.5, color: urgent ? 'var(--status-warning)' : 'var(--me-grey-70)' }}>{dueLabel(r.replyDueDays)}</span>
              </div>
            )
          })
        )}
      </div>

      <NewCheckModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(caseId) => { setNewOpen(false); navigate(`/lc-check/cases/${caseId}/intake`) }}
      />
    </section>
  )
}
