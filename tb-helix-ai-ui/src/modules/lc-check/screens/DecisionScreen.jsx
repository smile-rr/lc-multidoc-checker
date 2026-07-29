import { cardSurface } from '@shared/ds/Card'
import { ellipsis } from '@shared/ds/text'
import { useState, useMemo } from 'react'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import { toneOf } from '@shared/lib/tone'
import { plural } from '@shared/lib/format'
import DispositionChips from '../components/DispositionChips'
import DiscrepancyStatement from '../components/DiscrepancyStatement'
import { severityMeta, dispositionLabel, VERDICTS } from '../state/severity'
import { useCase } from '../state/CaseContext'

// Stage 5 — the officer's decision.
//
// The engine has no vote here. Every finding needing a call is listed with the
// check that produced it, the statement that would go out in the advice, and the
// officer's disposition. The verdict, the note and the signature are theirs.
//
// Rows collapse because this list is read twice for different reasons: once
// scanning for what is still open, once reading a specific finding in full. A
// list that is always expanded serves the second and defeats the first.
export default function DecisionScreen({ onOpenFinding }) {
  const { data, visible, officer, actions } = useCase()
  const [expanded, setExpanded] = useState({})

  const rows = visible.attention
  const checkById = useMemo(() => Object.fromEntries(data.checks.map((c) => [c.id, c])), [data.checks])

  const decided = rows.filter((f) => officer.decisions[f.id]).length
  const open = rows.length - decided
  const allExpanded = rows.length > 0 && rows.every((f) => expanded[f.id])

  const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }))
  const setAll = (on) => setExpanded(on ? Object.fromEntries(rows.map((f) => [f.id, true])) : {})

  const tally = [
    { key: 'agreed', label: 'agreed', tone: 'success', n: rows.filter((f) => officer.decisions[f.id] === 'agreed').length },
    { key: 'rejected', label: 'not discrepancies', tone: 'error', n: rows.filter((f) => officer.decisions[f.id] === 'rejected').length },
    { key: 'parked', label: 'parked', tone: 'warning', n: rows.filter((f) => officer.decisions[f.id] === 'parked').length },
    { key: 'open', label: 'still open', tone: 'neutral', n: open },
  ]

  return (
    <section className="helix-screen" style={{ padding: '18px 32px 40px', display: 'grid', gridTemplateColumns: 'minmax(360px,1fr) minmax(320px,400px)', gap: 16, alignItems: 'start' }}>
      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--me-grey-15)', minHeight: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Dispositions</span>
            {rows.length ? (
              <button
                onClick={() => setAll(!allExpanded)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5, width: 96, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--me-blue)' }}
              >
                <Icon name={allExpanded ? 'chevrons-down-up' : 'chevrons-up-down'} size={13} />
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {tally.map((t) => {
              const tone = toneOf(t.tone)
              return (
                <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: tone.wash, fontSize: 12, color: tone.text, whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{t.n}</span>
                  <span>{t.label}</span>
                </span>
              )
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '28px 18px', fontSize: 13, color: 'var(--me-grey-70)' }}>
            Nothing needs a decision yet — run the review first.
          </div>
        ) : (
          rows.map((f) => {
            const d = officer.decisions[f.id]
            const sev = severityMeta(f.severity)
            const isOpen = !!expanded[f.id]
            const check = f.checkId ? checkById[f.checkId] : null

            return (
              <div key={f.id} style={{ borderBottom: '1px solid var(--me-grey-08)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 18px' }}>
                  <button
                    onClick={() => toggle(f.id)}
                    aria-expanded={isOpen}
                    title={isOpen ? 'Collapse' : 'Expand'}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', marginTop: 3, color: 'var(--me-grey-50)' }}
                  >
                    <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={15} />
                  </button>

                  <span style={{ width: 7, height: 7, borderRadius: 999, background: sev.dot, flex: '0 0 7px', marginTop: 8 }} />

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      {/* Check reference first: it is the unique handle for this
                          finding, and what gets quoted in the advice and the file. */}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: f.checkId ? 'var(--me-grey-70)' : '#946400', whiteSpace: 'nowrap' }}>
                        {f.checkId ?? 'no check'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--me-grey-70)', minWidth: 0, ...ellipsis }}>
                        {check?.name ?? f.area}
                      </span>
                    </div>
                    <span
                      onClick={() => toggle(f.id)}
                      style={{ fontSize: 13, color: 'var(--me-ink)', lineHeight: 1.4, cursor: 'pointer', ...(isOpen ? {} : { ...ellipsis }) }}
                    >
                      {f.title}
                    </span>
                  </div>

                  {/* Fixed width: the label changes from "Open" to "Not one" as
                      the officer decides, and a shrinking label slid the chips
                      out from under the cursor mid-click. */}
                  <span style={{ flex: '0 0 62px', textAlign: 'right', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 4, color: d ? toneOf(d === 'agreed' ? 'success' : d === 'parked' ? 'warning' : 'error').text : 'var(--me-grey-70)' }}>
                    {dispositionLabel(d)}
                  </span>
                  <div style={{ marginTop: 1 }}>
                    <DispositionChips value={d} onPick={(next) => actions.decide(f.id, next)} />
                  </div>
                </div>

                {isOpen ? (
                  // Recessed, so an open row reads as a nested panel instead of
                  // blending into the rows above and below it.
                  <div style={{ margin: '0 18px 12px 55px', padding: '12px 14px', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <DiscrepancyStatement text={f.statement} tone={sev.accent} compact onSurface />
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey)' }}>{f.analysis.why}</p>
                    {f.analysis.options?.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {f.analysis.options.map((o, i) => (
                          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--me-grey)' }}>{o}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      onClick={() => onOpenFinding(f.id)}
                      style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                      Open the full finding →
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...cardSurface(12), boxShadow: 'none', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Button onClick={actions.submit} disabled={officer.submitted}>{officer.submitted ? 'Submitted' : 'Submit'}</Button>
            <Button variant="secondary" size="sm" onClick={() => actions.flash('Findings exported as Excel.')}>Export to Excel</Button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--me-grey-70)' }}>To {data.authoriser}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: open ? 'var(--me-grey-70)' : 'var(--status-success)' }}>
            <Icon name={open ? 'circle-dashed' : 'check-circle-2'} size={14} />
            <span>{open ? `${plural(open, 'finding')} still open` : 'Every finding has a call — ready to send'}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2, borderTop: '1px solid var(--me-grey-08)' }}>
            {VERDICTS.map((v) => {
              const on = officer.verdict === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => actions.dispatch({ type: 'verdict', verdict: v.id })}
                  title={v.sub}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 2px', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
                >
                  <span style={{ width: 15, height: 15, flex: '0 0 15px', borderRadius: 999, border: `1.5px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-50)'}`, background: on ? 'var(--me-blue)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <span style={{ width: 5, height: 5, borderRadius: 999, background: '#fff' }} /> : null}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--me-ink)', fontWeight: on ? 600 : 400 }}>{v.label}</span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--me-grey-08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>Review Note</span>
              <span
                title="Notes you left on individual findings are collected here. Edit or add anything else in your own words — it travels with the case."
                style={{ display: 'flex', color: 'var(--me-grey-70)', cursor: 'help' }}
              >
                <Icon name="help-circle" size={14} />
              </span>
            </div>
            <textarea
              value={officer.reviewNote}
              onChange={(e) => actions.dispatch({ type: 'review_note', text: e.target.value })}
              placeholder="Your note on this review"
              style={{ width: '100%', minHeight: 132, resize: 'vertical', border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '11px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ ...cardSurface(12), boxShadow: 'none', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>Routing</span>
          {[
            { icon: 'user-check', color: 'var(--me-blue)', text: 'You are the maker of record', sub: 'The AI pre-check does not sign anything' },
            { icon: 'arrow-right', color: 'var(--me-blue)', text: `Checker: ${data.authoriser}`, sub: 'Amount over USD 1m — a senior checker must confirm' },
            { icon: 'alert-triangle', color: 'var(--status-warning)', text: `${plural(visible.manual.length, 'item')} the AI did not cover`, sub: 'Passed to the checker as open questions' },
          ].map((r) => (
            <div key={r.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', marginTop: 2 }}><Icon name={r.icon} size={14} color={r.color} /></span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12.5, color: 'var(--me-ink)', lineHeight: 1.4 }}>{r.text}</span>
                <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{r.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
