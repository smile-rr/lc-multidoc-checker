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
export default function CostDrawer({ open, onClose, cost, stepCount, completedCount, pageCount, modelSummary }) {
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
          <Section name="Totals">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Metric label="Wall Clock" value={duration(cost.wallClock)} note={`${duration(cost.seconds)} of agent time, 1.8× parallel`} />
              <Metric label="Tokens" value={thousands(cost.tokens, 1)} note={`${thousands(cost.tokensIn)} in · ${thousands(cost.tokensOut, 1)} out`} />
              <Metric label="Cost" value={usd(cost.cost)} note={finished ? `${usd(cost.costPerPage)} per page` : 'so far'} />
            </div>
          </Section>

          {/* The split that decides anything, directly under the total. Reading and
              planning are the fixed cost of accepting the file; the examination
              itself divides by card kind, and the two halves could not be less
              alike. An officer weighing whether to let the requirements run after a
              rule has already failed is asking exactly this. */}
          {cost.byKind.length ? (
            <Section name="Where It Went" note="Read, plan, then the two kinds of card. Rule cards are free; requirement cards are the bill.">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cost.byKind.map((k) => (
                  <KindRow key={k.key} kind={k} />
                ))}
              </div>
              {cost.cardsFree ? (
                <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--me-grey-70)' }}>
                  {cost.cardsFree} of {cost.cardsSettled} cards were settled without asking a model
                  anything — {percent((cost.cardsFree / cost.cardsSettled) * 100)} of the examination,
                  at no cost and with the same answer every time.
                </p>
              ) : null}
            </Section>
          ) : null}

          <Section name="Coverage" note="How much reading actually happened.">
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 8 }}>
              <Row term="Pages read" value={`${cost.pagesRead} of ${pageCount}`} />
              <Row term="Cards settled" value={cost.cardsSettled ? `${cost.cardsSettled}, ${cost.cardsFree} without a model` : 'none yet'} />
              <Row term="Model calls" value={cost.calls ? String(cost.calls) : 'none'} />
              <Row term="Cache hit" value={cost.cacheHitPct ? percent(cost.cacheHitPct) : 'none'} />
              <Row term="Repairs" value={cost.retries ? `${cost.retries} step${cost.retries === 1 ? '' : 's'} retried` : 'none'} />
              <Row term="Steps" value={`${completedCount} of ${stepCount} returned`} />
            </dl>
          </Section>

          {cost.byModel.length ? (
            <Section
              name="By Model"
              note="GPT-4o reads the pages, Qwen plans and screens, Sonnet reads the requirement cards. Their prices differ by an order of magnitude — and the engine, which settles the rule cards, is not a model at all."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {cost.byModel.map((m) => (
                  <ModelRow key={m.modelId} model={m} />
                ))}
              </div>
            </Section>
          ) : null}

          <Section name="By Step" note="Every step of the run, in order.">
            <StepList cost={cost} completedCount={completedCount} />
          </Section>

          {modelSummary ? (
            <Section name="Run Detail" last>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.7 }}>{modelSummary}</span>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--me-grey-70)' }}>Charged to the trade-finance AI budget.</div>
            </Section>
          ) : null}
        </>
      )}
    </Drawer>
  )
}

/** A titled band. Sections are separated by a rule, not by a card each. */
function Section({ name, note, last, children }) {
  return (
    <section style={{ padding: '16px 22px 18px', borderBottom: last ? 'none' : '1px solid var(--me-grey-15)' }}>
      <Eyebrow as="h3" style={{ margin: '0 0 2px' }}>
        {name}
      </Eyebrow>
      {note ? (
        <p style={{ margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>{note}</p>
      ) : (
        <div style={{ height: 10 }} />
      )}
      {children}
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

function Row({ term, value }) {
  return (
    <>
      <dt style={{ fontSize: 12.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>{term}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-ink)', textAlign: 'right' }}>{value}</dd>
    </>
  )
}

// One part of the run: what it settled, what it took, what it cost.
//
// A free part says "no model" rather than "$0.00". The zero is the interesting fact
// and a currency-formatted zero reads as a rounding artefact or a missing figure.
function KindRow({ kind: k }) {
  const RULE_TONE = { rule: 'var(--me-blue-deep)', requirement: '#1F7A00' }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--me-grey-08)' }}>
      <span style={{ display: 'flex', marginTop: 2, flexShrink: 0, color: RULE_TONE[k.key] ?? 'var(--me-grey-50)' }}>
        <Icon
          name={k.key === 'rule' ? 'equal' : k.key === 'requirement' ? 'list-checks' : k.key === 'read' ? 'scan-text' : 'route'}
          size={13}
          color="currentColor"
        />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>{k.label}</span>
        <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--me-grey-70)' }}>{k.note}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)' }}>
          {k.checks ? <span>{plural(k.checks, 'card')}</span> : null}
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

function ModelRow({ model: m }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>{m.label}</span>
          <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{m.role} · {m.host}</span>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--me-ink)' }}>{usd(m.cost)}</div>
          <div style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{percent(m.costShare * 100)} of spend</div>
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 999, background: 'var(--me-grey-15)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(2, m.costShare * 100)}%`, background: 'var(--me-blue)', borderRadius: 999 }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>
        <span>{m.calls} calls</span>
        <span>{thousands(m.tokensIn)} / {thousands(m.tokensOut, 1)} tok</span>
        <span>{m.cacheHitPct ? `${percent(m.cacheHitPct)} cached` : 'uncached'}</span>
        <span>{durationShort(m.seconds)}</span>
        <span>${m.inPerMillion} / ${m.outPerMillion} per M</span>
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
