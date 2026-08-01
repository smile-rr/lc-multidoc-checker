import { Fragment, useState } from 'react'
import Eyebrow from '@shared/ds/Eyebrow'
import Drawer from '@shared/ds/Drawer'
import Badge from '@shared/ds/Badge'
import Icon from '@shared/ds/Icon'
import { ellipsis } from '@shared/ds/text'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { durationShort, usdFine, seconds2, percent, plural } from '@shared/lib/format'
// The same grouping the run log uses. Two formatters for one fact would let the
// panel and the log disagree about a number they both read off the ledger.
import { tokens as tok, CACHE } from '../state/runLog.js'

/**
 * The one hue in this drawer: spend that bought nothing.
 *
 * Everything else here is a fact about a bill, and a fact has no good or bad state
 * to signal — so the panel's hierarchy is carried entirely by size, weight and the
 * grey ramp. A retried call is different in kind: it was charged for and returned
 * nothing, and it is the only figure on the panel that asks someone to act. It gets
 * the colour precisely because nothing around it has one.
 */
const WASTED = '#946400'

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
export default function CostDrawer({ open, onClose, cost, stepCount, completedCount, pageCount, onRefresh, live }) {
  const finished = completedCount >= stepCount
  const started = completedCount > 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Run Cost"
      subtitle={finished
        ? `Complete · ${stepCount} steps`
        : started
          ? `Running · ${completedCount} of ${stepCount} steps${live ? ' · updating' : ''}`
          : 'Not started'}
      width={560}
      headerExtra={onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh costs from the ledger"
          aria-label="Refresh costs"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-70)', display: 'flex', padding: 2 }}
        >
          <Icon name="refresh-cw" size={16} />
        </button>
      ) : null}
      footer={<ModelPriceStrip prices={cost.modelPrices} />}
    >
      {!started ? (
        <Section name="Not Started">
          <Empty>Nothing has run on this case yet.</Empty>
        </Section>
      ) : (
        <>
          {/* Money first, then time; tokens beneath both rather than beside them.
              The drawer is called Run Cost, so the bill leads — it used to sit second,
              behind a duration, in a panel named after it.

              Tokens are not a third metric of the same rank — 38k on GPT-4o and 38k
              on Qwen are an order of magnitude apart in money, so a token tile next
              to a cost tile invites a comparison that does not hold. What they are
              is the *working* behind the cost: the one line that lets someone check
              a figure they think is wrong, and the only place the input/output split
              shows, which matters because output runs 8× input on a flash model. */}
          <Section name="Totals">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'end' }}>
              <Metric
                label="Charged"
                value={usdFine(cost.cost)}
                note={finished ? `${usdFine(cost.costPerPage)} per page` : 'so far'}
                lead
              />
              <Metric
                // "Wall Clock" over the sum of every call's latency was wrong twice:
                // slots that ran at the same time are counted once each, and the stage's
                // own work — rendering, rules, the database — is in none of it. It is the
                // time spent inside models, so it says that. Wall clock for the whole run
                // is a different measurement, off the stage spans, and the portfolio panel
                // is where it belongs.
                label="Model Time"
                value={seconds2(cost.seconds)}
                // The only coloured thing in the drawer, and only when it is not zero.
                // A failed call is money charged for an answer nobody got — the one
                // figure here that asks someone to do something about it. Everything
                // else is a fact, and a fact does not need a colour.
                //
                // The darker amber, not `--status-warning`: that token is #e8a200,
                // which is a fill colour. As text on white it sits near 2.2:1 and the
                // one thing on the panel that has to be read would be the hardest
                // thing on it to read.
                note={
                  <>
                    {plural(cost.calls, 'call')}
                    {cost.retries ? (
                      <span style={{ color: WASTED, fontWeight: 600 }}>
                        {' · '}{cost.retries} failed, charged anyway
                      </span>
                    ) : null}
                  </>
                }
              />
            </div>
            <BillRail cost={cost} />
            <TokenLine cost={cost} />
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
            <Section name="Where It Went">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cost.byKind.map((k) => (
                  <KindRow key={k.key} kind={k} pagesRead={cost.pagesRead} pageCount={pageCount} />
                ))}
              </div>
              {cost.cardsFree ? (
                <p style={{ margin: '9px 0 0', fontSize: 11, color: 'var(--me-grey-70)' }}>
                  {cost.cardsFree} of {cost.cardsSettled} rules settled without a model
                </p>
              ) : null}
            </Section>
          ) : null}

          {/* Open by default — the audit trail in run order is what most people
              open the drawer for after the totals. Still foldable once read. */}
          <Section name="By Step" collapsible defaultOpen count={`${completedCount} of ${stepCount}`}>
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
                cost.localCachePct ? `local cache ${percent(cost.localCachePct)}` : null,
                cost.promptCachePct ? `prompt cache ${percent(cost.promptCachePct)}` : null,
              ].filter(Boolean).join(', ')}
            </span>
          </Section>

          {/* The price table is not here. It is pinned to the base of the drawer, outside
              this scroll — see the `footer` prop above. The body is one case; a rate is a
              standing parameter, and scrolling past a case to reach it had it backwards. */}
        </>
      )}
    </Drawer>
  )
}

/**
 * A titled band. Sections are separated by a rule, not by a card each.
 *
 * `collapsible` folds a section behind its heading. Pass `defaultOpen` when the
 * body should start expanded (By Step) rather than waiting to be asked for.
 */
function Section({ name, note, last, collapsible, defaultOpen, count, children }) {
  const [open, setOpen] = useState(collapsible ? !!defaultOpen : true)
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

/**
 * The run's token totals: what was billed, and what the local cache kept off the bill.
 *
 * Two clusters, never one sum. A local-cache hit's tokens are the *original* call's,
 * replayed from the derivation store — adding them to the billed pair would report
 * work this run did not do, and would make the cheapest possible run look like the
 * busiest.
 *
 * The provider's prompt cache is a third figure and belongs to neither: it is part
 * of the billed input, at a reduced rate. It shows inside the billed cluster for
 * that reason, and is named `prompt cache` so it can never be read as free.
 */
function TokenLine({ cost }) {
  const billed = (cost.tokensIn ?? 0) + (cost.tokensOut ?? 0)
  const avoided = (cost.tokensInAvoided ?? 0) + (cost.tokensOutAvoided ?? 0)
  if (!billed && !avoided) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <Tokens tokensIn={cost.tokensIn} tokensOut={cost.tokensOut} promptCached={cost.tokensCachedIn} />
      {avoided ? (
        <Tokens tokensIn={cost.tokensInAvoided} tokensOut={cost.tokensOutAvoided} cached />
      ) : null}
    </div>
  )
}

/**
 * `charged · in 1,718  out 664`, or `local cache · in 300  out 100` for tokens no
 * call was made for.
 *
 * Words rather than arrows: `↓`/`↑` read as either direction depending on whether
 * you picture the request or the response, and on a flash model output costs eight
 * times input — so reading them the wrong way round inverts the conclusion.
 *
 * And `local cache` rather than `not charged`, which was true of this one cache and
 * would quietly mislead about the other: the provider's prompt cache is charged, at
 * about a tenth of the rate. A reader who has learnt that "cache" means free would
 * read a real bill as zero the first time one appears.
 *
 * The two clusters are told apart by a **leading word and one step of grey**, where
 * they used to be told apart by a ⚡ in `--status-success`. The bolt was the loudest
 * glyph in the icon set, spent on the cluster that costs nothing, next to a billed
 * cluster in the palest grey on the row — so the eye went to the free half of a
 * money panel every time. Billed sits a shade darker now, and nothing here is
 * coloured at all: this drawer reports a bill, and a bill has no good or bad state
 * to signal.
 */
function Tokens({ tokensIn, tokensOut, cached, promptCached }) {
  return (
    <span
      title={cached ? CACHE.local.title : 'Tokens sent to and returned by the model, and charged for'}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap',
        color: cached ? 'var(--me-grey-70)' : 'var(--me-grey)',
      }}
    >
      <span style={{ color: 'var(--me-grey-70)' }}>{cached ? CACHE.local.word : 'charged'} ·</span>
      <span>in {tok(tokensIn ?? 0)}</span>
      {promptCached ? (
        <span title={CACHE.prompt.title} style={{ color: 'var(--me-grey-50)' }}>
          ({tok(promptCached)} {CACHE.prompt.word})
        </span>
      ) : null}
      <span>out {tok(tokensOut ?? 0)}</span>
    </span>
  )
}

/**
 * A headline figure. `lead` makes it the one the eye lands on.
 *
 * The hierarchy is carried by size and ink, not by hue — there is no colour anywhere
 * in this drawer that means "important", because the moment there is, the reader
 * starts looking for the colour instead of reading the number.
 */
function Metric({ label, value, note, lead }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: lead ? 28 : 19,
        fontWeight: lead ? 600 : 400,
        letterSpacing: lead ? '-0.02em' : 0,
        color: lead ? 'var(--me-ink)' : 'var(--me-grey)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 12, fontWeight: lead ? 600 : 400, color: lead ? 'var(--me-ink)' : 'var(--me-grey)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{note}</span>
    </div>
  )
}

/**
 * What this run was charged, against what it would have cost cold.
 *
 * One hairline, two greys, no legend: the solid part is the bill, the ghost is what
 * the cache kept off it. The ratio is the whole point, and a ratio is the one thing
 * a number pair cannot show at a glance — `$0.0041 avoided` beside `$0.0231 charged`
 * is two figures to divide, this is a length to look at.
 *
 * Monochrome deliberately. An earlier drawer painted every avoided cent in
 * `--status-success` with a ⚡ beside it, which made a mostly-cached run — the normal
 * run, because that is what a cache is for — read as a field of green congratulation
 * with the actual bill set in the palest grey on screen. Savings are not a success
 * state. They are the part of the bar that is not there.
 *
 * Absent when nothing was avoided: a bar that is always full says nothing, and one
 * that appears only when there is a ratio to show is a signal on its own.
 */
function BillRail({ cost }) {
  const avoided = cost.costAvoided ?? 0
  if (!avoided || !cost.cost) return null
  const cold = cost.cost + avoided
  const share = (cost.cost / cold) * 100
  return (
    <div style={{ marginTop: 14 }}>
      <div
        title={`Charged ${usdFine(cost.cost)} · saved ${usdFine(avoided)} (cold ${usdFine(cold)})`}
        style={{ display: 'flex', height: 3, borderRadius: 999, overflow: 'hidden', background: 'var(--me-grey-15)', cursor: 'help' }}
      >
        <div style={{ width: `${share}%`, background: 'var(--me-ink)' }} />
      </div>
      {/* Figures, not a sentence. The rail shows the ratio; this names its two ends. */}
      <p style={{ margin: '7px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)' }}>
        {usdFine(cold)} cold · {usdFine(avoided)} saved
        {cost.localCachePct ? ` · ${percent(cost.localCachePct)} of calls cached` : ''}
      </p>
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
        {/* No `k.note` here any more. Four rows each carrying a sentence of
            explanation buried the four numbers they exist to introduce. */}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>{k.label}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)' }}>
          {k.checks ? <span>{plural(k.checks, 'rule')}</span> : null}
          {/* The reading row settles no cards, so its slot says what it did read —
              which is where "pages read" lived before Coverage was cut. */}
          {k.key === 'read' && pageCount ? <span>{pagesRead} of {pageCount} pages</span> : null}
          <span>{k.calls ? plural(k.calls, 'call') : 'no calls'}</span>
          {/* Split, not totalled. `38.2K tok` says nothing a reader can act on;
              the ratio between the two halves does, because output is priced
              several times higher than input on every model here. */}
          {k.tokens
            ? <span>in {tok(k.tokensIn)} out {tok(k.tokensOut)}</span>
            : <span>no tokens</span>}
          <span>{durationShort(k.seconds)}</span>
        </span>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums',
          // The part that cost money is the darker, heavier one. `no model` recedes:
          // it was green here, which made the free rows the first thing read in a
          // breakdown of where the money went.
          fontWeight: k.free ? 400 : 600,
          color: k.free ? 'var(--me-grey-70)' : 'var(--me-ink)',
        }}>
          {k.free ? 'no model' : usdFine(k.cost)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--me-grey-70)' }}>
          {k.free ? 'free' : `${percent(k.costShare * 100)} of spend`}
        </div>
      </div>
    </div>
  )
}

/**
 * Model Price — the standing rate table, pinned to the base of the drawer.
 *
 * <p>A price list and nothing else: model, input rate, output rate. No tokens, no cost,
 * no total. Those belong to the run scrolling above it, and mixing them in was what made
 * an earlier version read as a second, competing summary of the same case.
 *
 * <p>It sits outside the drawer's scroll deliberately. The body answers "what did this
 * case cost" and can grow without limit; a rate is a system parameter that does not
 * belong to any case. Pinning it means the figure being questioned and the rate that
 * produced it are on screen together, however far down the body a reader has gone.
 *
 * <p>Open by default, because it is three or four lines and the whole point is that it
 * is already there. Collapsible for the reader who wants the height back — the state is
 * remembered, so that is a decision made once rather than every time the drawer opens.
 */
function ModelPriceStrip({ prices }) {
  const [open, setOpen] = usePersistedState('lcCheck.modelPrice', true)
  if (!prices?.length) return null

  return (
    <div style={{ borderTop: '1px solid var(--me-grey-20)', background: 'var(--me-grey-08)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, width: '100%',
          padding: open ? '8px 22px 6px' : '9px 22px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={12} color="var(--me-grey-50)" />
        <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>
          Model Price
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>
          per million tokens
        </span>
      </button>

      {open ? (
        <div style={{ padding: '0 22px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 62px 62px', gap: '0 10px', alignItems: 'baseline' }}>
            <span style={PRICE_HEAD} />
            <span style={{ ...PRICE_HEAD, textAlign: 'right' }}>in</span>
            <span style={{ ...PRICE_HEAD, textAlign: 'right' }}>out</span>
            {prices.map((p) => (
              <Fragment key={p.modelId}>
                <span style={{ fontSize: 10.5, color: 'var(--me-grey)', padding: '3px 0', minWidth: 0, ...ellipsis }}>
                  {p.label}
                </span>
                <span style={PRICE_CELL}>{perMillion(p.inPerMillion)}</span>
                <span style={PRICE_CELL}>{perMillion(p.outPerMillion)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const PRICE_HEAD = {
  fontSize: 9, color: 'var(--me-grey-50)', paddingBottom: 3,
  borderBottom: '1px solid var(--me-grey-20)',
}

const PRICE_CELL = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums',
  textAlign: 'right', color: 'var(--me-grey-70)', padding: '3px 0',
}

/**
 * A rate per million tokens.
 *
 * Up to three decimals below a dollar — the cheap end of the book lives there, and a
 * $0.075 rate shown to two places is $0.08. Two places where the third would be a zero.
 */
function perMillion(v) {
  const n = Number(v ?? 0)
  if (n >= 1) return `$${n.toFixed(2)}`
  const three = n.toFixed(3)
  return `$${three.endsWith('0') ? three.slice(0, -1) : three}`
}

function StepList({ cost, completedCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {cost.rows.map((r) => {
        const done = r.state === 'done'
        const running = r.state === 'running' && completedCount > 0
        // Only the derivation cache counts as free — it means *no model was asked*.
        // `cachePct` is a different thing wearing the same word: the provider's own
        // prompt cache, which discounts a call that still happened. Treating 100%
        // of that as free would report a real bill as zero.
        const cached = r.fullyCached === true
        const avoided = (r.tokensInAvoided ?? 0) + (r.tokensOutAvoided ?? 0)
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
              {/* No mark here any more. The cost column on the right already says
                  `cached` in words, and a green ⚡ on every cached row turned the
                  step list into a column of bolts with the billed rows — the ones
                  worth looking at — as the only quiet thing on it. */}
              {/* Why a step cost nothing. Without it, a $0.00 row reads as a step
                  that failed to report rather than one that had no model to call. */}
              {r.note ? (
                <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.45, color: 'var(--me-grey-70)' }}>{r.note}</span>
              ) : null}
              {/* The work behind the row's money. A step that reads six pages and
                  one that answers a yes/no both cost fractions of a cent; the token
                  counts are what tell them apart. */}
              {done && (r.tokensIn || r.tokensOut || avoided) ? (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  {r.tokensIn || r.tokensOut ? <Tokens tokensIn={r.tokensIn} tokensOut={r.tokensOut} promptCached={r.tokensCachedIn} /> : null}
                  {avoided ? <Tokens tokensIn={r.tokensInAvoided} tokensOut={r.tokensOutAvoided} cached /> : null}
                </span>
              ) : null}
            </span>
            {/* The money column, and the inversion this drawer was built on: a row
                that cost something was `--me-grey-70` while a row that cost nothing
                was `--status-success`. On a mostly-cached run — the normal run — the
                only rows with any presence were the free ones.

                Now the charge is ink and the zero recedes. Time keeps its own grey:
                seconds are not money and should not read as though they were.

                This stays a money column all the way down — a cached row reads `$0`,
                not `local cache`. The reason it was nothing is already on the row, in
                the `local cache ·` that opens its token cluster and in the note saying
                what a cold run would have been charged; putting the word here too
                said it three times and stopped the column being scannable as one
                thing. */}
            {done ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {cached ? (
                  <span style={{ color: 'var(--me-grey-70)' }}>$0</span>
                ) : r.cost || r.seconds ? (
                  <>
                    <span style={{ color: 'var(--me-grey-50)' }}>{seconds2(r.seconds)}</span>
                    <span style={{ color: 'var(--me-grey-50)' }}>{'  ·  '}</span>
                    <span style={{ color: r.cost ? 'var(--me-ink)' : 'var(--me-grey-70)', fontWeight: r.cost ? 600 : 400 }}>
                      {usdFine(r.cost)}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--me-grey-70)' }}>no model</span>
                )}
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
