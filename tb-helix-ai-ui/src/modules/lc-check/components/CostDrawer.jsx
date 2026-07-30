import { useState } from 'react'
import Eyebrow from '@shared/ds/Eyebrow'
import Drawer from '@shared/ds/Drawer'
import Badge from '@shared/ds/Badge'
import Icon from '@shared/ds/Icon'
import { duration, durationShort, thousands, usd, percent, plural } from '@shared/lib/format'

// Run cost — what the review spent, in time and money, and where it went.
//
// Not tabbed. Tabs implied three equal bodies of data, and these are not: the
// totals are three numbers, the model breakdown is the part that changes
// decisions, and the step list is reference detail most people never open. Tabs
// also hid whichever section had nothing in it, when "we did not record that" is
// itself worth seeing. One column, sections that can each be absent.
//
// A section renders only when it has data, and says so when it does not, rather
// than showing a grid of em-dashes.
export default function CostDrawer({ open, onClose, cost, stepCount, completedCount, pageCount }) {
  const finished = completedCount >= stepCount
  const started = completedCount > 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Run Cost"
      subtitle={finished ? `Complete · ${stepCount} steps` : started ? `Running · ${completedCount} of ${stepCount} steps` : 'Not started'}
      width={560}
    >
      {!started ? (
        <Section name="Not Started">
          <Empty>Nothing has run on this case yet. Start the review and the cost appears here as each step returns.</Empty>
        </Section>
      ) : (
        <>
          {/* Time and money. Tokens were the third metric here and they are the same
              fact as the cost in a unit that needs a rate card to read — worse, they
              do not track it: 38k tokens on GPT-4o and 38k on Qwen are an order of
              magnitude apart. They still appear per row below, where they explain a
              number instead of restating it. */}
          <Section name="Totals">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Metric
                label="Wall Clock"
                value={duration(cost.wallClock)}
                note={`${duration(cost.seconds)} of agent time, 1.8× parallel${cost.retries ? ` · ${cost.retries} retried` : ''}`}
              />
              <Metric
                label="Cost"
                value={usd(cost.cost)}
                note={finished
                  ? `${usd(cost.costPerPage)} per page${cost.cacheHitPct ? ` · ${percent(cost.cacheHitPct)} of input cached` : ''}`
                  : 'so far'}
              />
            </div>
          </Section>

          {/* The split that decides anything, and now the body of the drawer rather
              than one section among six. Reading and planning are the fixed cost of
              accepting the file; the examination itself divides by card kind, and the
              two halves could not be less alike. An officer weighing whether to let
              the judged half run after an exact rule has already failed is asking
              exactly this.

              What used to sit around it, and why it is gone:

                · **Coverage** — six rows, four of which were sums of these rows or of
                  the drawer's own subtitle. Cards settled restated the sentence at the
                  foot of this section; model calls was the total of the calls in it;
                  steps repeated "5 of 9 steps" in the header. Pages read belongs on
                  the reading row, and cache and repairs are cost facts, so they moved
                  into the totals above.
                · **By model** — the same question as this section, cut a different
                  way. Which model the money went to is a procurement question about
                  the whole queue, not about this case, and the AI performance panel on
                  the cases list already answers it there. Here it competed with the
                  cut that leads to a decision. */}
          {cost.byKind.length ? (
            <Section name="Where It Went" note="Read, plan, then the two tiers. Exact rules are free; judged rules are the bill.">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cost.byKind.map((k) => (
                  <KindRow key={k.key} kind={k} pagesRead={cost.pagesRead} pageCount={pageCount} />
                ))}
              </div>
              {cost.cardsFree ? (
                <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--me-grey-70)' }}>
                  {cost.cardsFree} of {cost.cardsSettled} rules were settled without asking a model
                  anything — {percent((cost.cardsFree / cost.cardsSettled) * 100)} of the examination,
                  at no cost and with the same answer every time.
                </p>
              ) : null}
            </Section>
          ) : null}

          {/* Folded by default. It is the audit trail for this run — worth having,
              and not worth nine rows of the drawer before anyone has asked. */}
          <Section name="By Step" note="Every step of the run, in order." collapsible count={`${completedCount} of ${stepCount}`}>
            <StepList cost={cost} completedCount={completedCount} />
          </Section>

          {/* Derived, not authored.

              This line was a hand-written string on each case — "30 calls, 2 repairs,
              6 pages read, prompt cache 43%" — and by the time the run table changed
              it was reporting 30 calls against a computed 26 and a 43% cache against
              34%. A summary of numbers held next to the numbers it summarises will
              drift, and the drift is invisible because nothing compares them. It now
              reads off the same roll-up as everything above it. */}
          <Section name="Run Detail" last>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.7 }}>
              {cost.byModel.filter((m) => m.cost > 0).map((m) => m.label).join(' · ')}
              {' — '}
              {[
                plural(cost.calls, 'call'),
                cost.retries ? plural(cost.retries, 'repair') : null,
                `${cost.pagesRead} pages read`,
                cost.cacheHitPct ? `prompt cache ${percent(cost.cacheHitPct)}` : null,
              ].filter(Boolean).join(', ')}
            </span>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--me-grey-70)' }}>Charged to the trade-finance AI budget.</div>
          </Section>
        </>
      )}
    </Drawer>
  )
}

/**
 * A titled band. Sections are separated by a rule, not by a card each.
 *
 * `collapsible` is for reference detail: present, findable, and not occupying the
 * drawer until someone asks for it.
 */
function Section({ name, note, last, collapsible, count, children }) {
  const [open, setOpen] = useState(!collapsible)
  return (
    <section style={{ padding: '16px 22px 18px', borderBottom: last ? 'none' : '1px solid var(--me-grey-15)' }}>
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
          <Eyebrow as="h3" style={{ margin: 0 }}>{name}</Eyebrow>
          {count ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{count}</span> : null}
        </button>
      ) : (
        <Eyebrow as="h3" style={{ margin: '0 0 2px' }}>
          {name}
        </Eyebrow>
      )}
      {collapsible && !open ? null : (
      <>
      {note ? (
        <p style={{ margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>{note}</p>
      ) : (
        <div style={{ height: 10 }} />
      )}
      {children}
      </>
      )}
    </section>
  )
}

function Metric({ label, value, note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--me-ink)', lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--me-ink)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{note}</span>
    </div>
  )
}

// One part of the run: what it settled, what it took, what it cost.
//
// A free part says "no model" rather than "$0.00". The zero is the interesting fact
// and a currency-formatted zero reads as a rounding artefact or a missing figure.
function KindRow({ kind: k, pagesRead, pageCount }) {
  const RULE_TONE = { exact: 'var(--me-blue-deep)', judged: '#1F7A00' }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--me-grey-08)' }}>
      <span style={{ display: 'flex', marginTop: 2, flexShrink: 0, color: RULE_TONE[k.key] ?? 'var(--me-grey-50)' }}>
        <Icon
          name={k.key === 'exact' ? 'equal' : k.key === 'judged' ? 'list-checks' : k.key === 'read' ? 'scan-text' : 'route'}
          size={13}
          color="currentColor"
        />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>{k.label}</span>
        <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--me-grey-70)' }}>{k.note}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)' }}>
          {k.checks ? <span>{plural(k.checks, 'rule')}</span> : null}
          {/* The reading row settles no cards, so its slot says what it did read —
              which is where "pages read" lived before Coverage was cut. */}
          {k.key === 'read' && pageCount ? <span>{pagesRead} of {pageCount} pages</span> : null}
          <span>{k.calls ? plural(k.calls, 'call') : 'no calls'}</span>
          <span>{k.tokens ? `${thousands(k.tokens, 1)} tok` : 'no tokens'}</span>
          <span>{durationShort(k.seconds)}</span>
        </span>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: k.free ? 'var(--status-success)' : 'var(--me-ink)' }}>
          {k.free ? 'no model' : usd(k.cost)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--me-grey-70)' }}>
          {k.free ? 'free' : `${percent(k.costShare * 100)} of spend`}
        </div>
      </div>
    </div>
  )
}

function StepList({ cost, completedCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {cost.rows.map((r) => {
        const done = r.state === 'done'
        const running = r.state === 'running' && completedCount > 0
        return (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid var(--me-grey-08)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: done ? 'var(--me-ink)' : running ? 'var(--me-blue-deep)' : 'var(--me-grey-50)' }}>
              {r.name}
              <span style={{ marginLeft: 7, fontSize: 11, color: 'var(--me-grey-50)' }}>{r.modelLabel}</span>
              {/* Why a step cost nothing. Without it, a $0.00 row reads as a step
                  that failed to report rather than one that had no model to call. */}
              {r.note ? (
                <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.45, color: 'var(--me-grey-70)' }}>{r.note}</span>
              ) : null}
            </span>
            {done ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.cost ? 'var(--me-grey-70)' : 'var(--status-success)', whiteSpace: 'nowrap' }}>
                {r.cost ? `${durationShort(r.seconds)} · ${usd(r.cost)}` : 'no model'}
              </span>
            ) : (
              <Badge tone={running ? 'blue' : 'neutral'}>{running ? 'running' : 'queued'}</Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}

const Empty = ({ children }) => (
  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>{children}</p>
)
