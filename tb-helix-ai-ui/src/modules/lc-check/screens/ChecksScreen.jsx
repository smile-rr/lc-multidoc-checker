import { useMemo, useState } from 'react'
import Icon from '@shared/ds/Icon'
import Spinner from '@shared/ds/Spinner'
import { plural } from '@shared/lib/format'
import { severityMeta } from '../state/severity'
import CheckSpecCard from '../components/CheckSpecCard'
import { useCase } from '../state/CaseContext'

// Stage 3 — the plan, and it running.
//
// The plan is a real artefact, not a progress bar with labels: every check the
// credit brings into play is listed before anything executes, grouped by the
// agent that owns it, and each one carries the rule it will apply plus the
// request that will be sent to apply it.
//
// Three things are deliberate here:
//   · checks the credit does NOT trigger are listed, with the reason — "we didn't
//     check that" must never be discovered after signing
//   · checks the planner wrote for this credit's own :47A: conditions are shown
//     as such, because they did not come from the dictionary and carry different
//     weight
//   · a condition the planner found but no rule covers is marked not covered
//     rather than quietly omitted
export default function ChecksScreen({ onOpenFinding }) {
  const { data, run, officer, actions } = useCase()

  const allChecks = useMemo(() => [...data.checks, ...officer.addedChecks], [data.checks, officer.addedChecks])
  const [selectedId, setSelectedId] = useState(null)

  const statusOf = (check) => {
    if (!check.areaId) return check.addedByOfficer ? (run.finished ? 'done' : run.started ? 'running' : 'planned') : 'skipped'
    if (!run.started) return 'planned'
    if (run.completedAreaIds.includes(check.areaId)) return 'done'
    if (run.activeAreaId === check.areaId) return 'running'
    return 'queued'
  }

  const findingFor = (check) =>
    statusOf(check) === 'done' && check.findingId
      ? data.findings.find((f) => f.id === check.findingId) ?? null
      : null

  const groups = [
    ...data.areas.map((area) => ({
      key: area.id,
      label: area.name,
      note: area.purpose,
      checks: allChecks.filter((c) => c.areaId === area.id && !c.plannedByLlm),
    })),
    {
      key: 'planner',
      label: 'Planner-written',
      note: 'One per condition in :47A:. Not in the dictionary.',
      checks: allChecks.filter((c) => c.plannedByLlm),
    },
    ...(officer.addedChecks.length
      ? [{ key: 'added', label: 'Officer-added', note: 'Recorded against your name.', checks: officer.addedChecks }]
      : []),
    {
      key: 'skipped',
      label: 'Not applicable',
      note: 'This credit does not bring them into play.',
      checks: allChecks.filter((c) => !c.areaId && !c.addedByOfficer && !c.plannedByLlm),
    },
  ].filter((g) => g.checks.length)

  const selected = allChecks.find((c) => c.id === selectedId) ?? groups[0]?.checks[0] ?? allChecks[0]

  const areaCount = data.areas.length
  const doneCount = run.completedAreaIds.length
  const progressPct = Math.round((doneCount / areaCount) * 100)
  const willRun = allChecks.filter((c) => c.areaId).length
  const wontRun = allChecks.length - willRun

  return (
    <section className="helix-screen" style={{ padding: '16px 24px 28px', display: 'grid', gridTemplateColumns: 'minmax(330px,400px) minmax(460px,1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - var(--case-header-h, 240px) - 64px)' }}>
        <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Check plan</span>
            <button
              onClick={actions.addCheck}
              title="Add a check the credit does not call for — it runs with the rest and is recorded against your name"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, whiteSpace: 'nowrap' }}
            >
              <Icon name="plus" size={14} />
              Add a check
            </button>
          </div>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>
            {run.finished ? 'complete' : run.started ? `${doneCount} of ${areaCount} areas` : 'not started'}
            {' · '}{willRun} to run{wontRun ? ` · ${wontRun} not applicable` : ''}
          </span>

          <div style={{ height: 4, borderRadius: 999, background: 'var(--me-grey-15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--me-blue)', width: `${progressPct}%`, transition: 'width 520ms var(--ease-standard)' }} />
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: '8px 15px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--me-ink)' }}>{g.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{g.checks.length}</span>
                </div>
                {g.note ? <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{g.note}</span> : null}
              </div>

              {g.checks.map((c) => {
                const st = statusOf(c)
                const f = findingFor(c)
                const on = c.id === selected?.id
                const sev = f ? severityMeta(f.severity) : null
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 15px',
                      border: 'none',
                      borderBottom: '1px solid var(--me-grey-08)',
                      borderLeft: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
                      cursor: 'pointer',
                      background: on ? 'var(--me-blue-20)' : '#fff',
                    }}
                  >
                    <span style={{ width: 15, height: 15, flex: '0 0 15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {st === 'running' ? (
                        <Spinner />
                      ) : (
                        <Icon
                          name={st === 'done' ? 'check' : st === 'skipped' ? 'minus' : 'circle-dashed'}
                          size={14}
                          color={st === 'done' ? (f && f.severity !== 'clean' ? 'var(--status-warning)' : 'var(--status-success)') : 'var(--me-grey-50)'}
                        />
                      )}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', flex: '0 0 58px' }}>{c.id}</span>
                    <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, fontWeight: on ? 600 : 400, color: on ? 'var(--me-blue-deep)' : st === 'skipped' || st === 'queued' ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>
                      {c.name}
                    </span>
                    {c.notCovered ? (
                      <span title="No rule covers this condition" style={{ fontSize: 11, color: '#946400', whiteSpace: 'nowrap' }}>not covered</span>
                    ) : sev && f.severity !== 'clean' ? (
                      <span style={{ fontSize: 11, color: sev.text, whiteSpace: 'nowrap' }}>
                        {f.severity === 'discrepancy' ? 'discrepancy' : 'to decide'}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <CheckSpecCard
          check={selected}
          status={statusOf(selected)}
          finding={findingFor(selected)}
          onOpenFinding={onOpenFinding}
        />
      ) : null}
    </section>
  )
}
