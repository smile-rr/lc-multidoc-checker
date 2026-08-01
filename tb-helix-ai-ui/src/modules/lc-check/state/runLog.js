// Folding a case's events into what actually happened.
//
// The service emits a flat, ordered stream — `{seq, type, at, ...}` — and that is
// the right shape for a wire: adding a new kind of event is a constant, not a
// schema. It is the wrong shape to read. Nobody asks "what was event 47"; they
// ask which stage is running, which step it is on, and why interpret took ninety
// seconds.
//
// So the flat tape folds into **two** tiers, not three:
//
//   stage     intake · interpret · gate · plan · execute · signoff
//   entry       one time-ordered list per stage — steps and events together
//
// An entry is a step or an event and differs only in `kind`. Nesting events under
// the step that was open when they arrived was the earlier design, and it was
// wrong twice over: an event that arrived between two steps had nowhere to go and
// was appended to the stage instead, so it rendered *after* every step regardless
// of when it happened — a run's findings piled up at the bottom out of order,
// minutes adrift from the checks that raised them. And a step's own events sat
// under a row the reader had to already be looking at. A log is read as a
// sequence; the arrival order is the information.
//
// A step is still a span with a duration, and an event is still a point in time.
// That difference is real and the panel draws it. Where they sit is not.
//
// **Spans are derived, not stored.** A `stage_started` opens one and the matching
// `stage_done` / `stage_failed` / `gate_halted` closes it; likewise
// `step_started` and `step_finished`. Anything still open when the tape runs out
// is still running, and its elapsed time is measured against now — which is what
// makes a live panel and a post-mortem panel the same component.
//
// Two details worth knowing:
//
//   * A step can finish without having started. A step whose preconditions were
//     not met is skipped before it announces itself, so the ending arrives alone.
//     That is recorded as a step that took no time, because it did not run.
//   * Where `ms` is on the event, it wins over end-minus-start. The service
//     measured the work; we measured the work plus however long the event queued.

/** Terminal events, and what each one means for the stage it names. */
const STAGE_ENDS = {
  stage_done: 'done',
  stage_failed: 'failed',
  gate_halted: 'halted',
}

const ms = (a, b) => (a == null || b == null ? null : Math.max(0, b - a))
const at = (event) => (event.at ? Date.parse(event.at) : null)

/**
 * Folds an ordered event list into stages, steps and their spans.
 *
 * @param events ordered by seq — the history endpoint and the stream both give
 *               them that way, and the caller keeps them so by merging on seq
 * @param now    the clock, passed in so a running span can be measured and so
 *               the fold stays a pure function
 */
export function foldRunLog(events = [], now = Date.now()) {
  const stages = []
  const byKey = new Map()

  // The stage and step a bare event belongs to. `segment`, `area_started` and
  // `finding` carry no stage of their own — they are reported from inside
  // whatever is running, and in a stream that is unambiguous.
  let openStage = null
  let openStep = null

  // Total: it always returns a stage. An event that names none belongs to whatever
  // is open, and one that arrives with nothing open at all goes in a bucket rather
  // than off the end — a tape written before an event learned to name its stage is
  // still a tape somebody has to read, and it must not take the panel down.
  const UNPLACED = '—'
  const stageFor = (key) => {
    const id = key || openStage?.key || UNPLACED
    let stage = byKey.get(id)
    if (!stage) {
      stage = {
        key: id,
        label: id === UNPLACED ? 'Outside a stage' : id,
        startedAt: null, endedAt: null, ms: null,
        // The bucket is not a stage and never runs, so it must not be drawn as one
        // still going. A stage proper starts at `running` and gets there by having
        // announced itself.
        status: id === UNPLACED ? 'unplaced' : 'running',
        // The one list the panel draws, in arrival order. `steps` holds the same
        // step objects by reference — a view for the code that asks "what is
        // running", never a second place a row can live.
        entries: [], steps: [],
        // Hand-back / halt — stage footer, not a leaf under the step rail.
        outcome: null,
      }
      byKey.set(id, stage)
      stages.push(stage)
    }
    return stage
  }

  for (const event of events) {
    const t = at(event)

    if (event.type === 'stage_started') {
      const stage = stageFor(event.stage)
      // A rerun starts the same stage again. It is the same row — reopened, with
      // the previous run's steps cleared — rather than a second row with the same
      // name, which would read as two stages having run.
      Object.assign(stage, { startedAt: t, endedAt: null, ms: null, status: 'running', entries: [], steps: [], outcome: null })
      openStage = stage
      openStep = null
      continue
    }

    if (STAGE_ENDS[event.type]) {
      const stage = stageFor(event.stage)
      // Only an ending that says which stage it ended, or that arrives while one is
      // open, closes anything. Tapes written before `gate_halted` carried its stage
      // still exist, and a halt nobody can attribute must not go and mark the bucket
      // it landed in as halted.
      if (!event.stage && stage.startedAt == null) { stage.entries.push(row(event, t)); continue }
      // A second stage_done for the same run is noise on the wire (launcher + journal).
      // Keep the first ending; do not append another identical row.
      if (stage.status === STAGE_ENDS[event.type] && stage.endedAt != null) continue
      stage.status = STAGE_ENDS[event.type]
      stage.endedAt = t
      stage.ms = event.ms ?? ms(stage.startedAt, t)
      // A stage that ended cannot still have a step in flight. Anything left open
      // ended with it, however it ended.
      stage.steps.forEach((s) => { if (s.status === 'running') { s.status = stage.status; s.endedAt = t; s.ms = ms(s.startedAt, t) } })
      // stage_done itself is the header's Done badge — not a leaf under the steps.
      // Halt/fail still leave a row so the reason stays visible.
      if (event.type !== 'stage_done') {
        stage.outcome = row(event, t)
      }
      if (openStage === stage) { openStage = null; openStep = null }
      continue
    }

    if (event.type === 'step_started') {
      const stage = stageFor(event.stage)
      // Same key announced twice (engine + body) must not open two running rows.
      const existing = [...stage.steps].reverse().find((s) => s.key === event.step && s.status === 'running')
      if (existing) {
        if (event.label) existing.label = event.label
        openStage = stage
        openStep = existing
        continue
      }
      const step = newStep(event, t, null)
      stage.steps.push(step)
      stage.entries.push(step)
      openStage = stage
      openStep = step
      continue
    }

    if (event.type === 'step_finished') {
      const stage = stageFor(event.stage)
      let step = [...stage.steps].reverse().find((s) => s.key === event.step && s.status === 'running')
      if (!step) {
        // Stage already closed this key and the engine is only asking for a refetch
        // (alreadyClosed), or a late ending landed after the row finished. Update the
        // existing row — never invent a ghost 0 ms step for work that already ended.
        const prior = [...stage.steps].reverse().find((s) => s.key === event.step)
        if (prior || event.alreadyClosed) {
          if (prior && event.label) prior.label = event.label
          if (openStep && openStep.key === event.step) openStep = null
          continue
        }
        // Finished without starting — skipped before it announced itself. Real,
        // and worth a row: "we considered this and it did not apply" is an answer.
        step = newStep(event, t, t)
        stage.steps.push(step)
        stage.entries.push(step)
      }
      step.status = (event.status || 'OK').toLowerCase()
      step.endedAt = t
      step.ms = event.ms || ms(step.startedAt, t)
      if (event.label) step.label = event.label
      if (openStep === step) openStep = null
      continue
    }

    // `cache_hit` came from the stage and said only that something was cached.
    // `llm_cached` comes from the cache itself and says which model was not called
    // and what it would have cost. The ⚡ hangs off the second one now, so the mark
    // means an avoided model call rather than a stage's claim about one.
    //
    // The old type is still folded, because tapes written before the change exist
    // and a run log that could not read them would be a run log with a cliff in it.
    if (event.type === 'cache_hit') {
      const stage = stageFor(event.stage)
      const step = [...stage.steps].reverse().find((s) => s.key === event.step)
      if (step) step.cacheHit = true
      continue
    }
    if (event.type === 'llm_cached') {
      const stage = stageFor(event.stage)
      // The event's own step wins over whatever is open. `openStep` reads as "the step
      // this belongs to" only while steps run one after another — interpret now reads
      // several documents at once, so the last one to announce is not the one that got
      // the cache hit, and the ⚡ landed on whichever row happened to start most
      // recently. The fallback stays for tapes written before the event carried a step.
      const named = event.step && [...stage.steps].reverse().find((s) => s.key === event.step)
      const step = named || openStep
      if (step) step.cacheHit = true
    }

    // Everything else lands where it happened: at the end of the stage's list, in
    // arrival order, whether or not a step was open at the time. Which step was
    // running is visible from the row above it — it does not need to be expressed
    // by containment, and expressing it that way is what put the events that
    // belonged to no open step at the bottom of the stage, minutes out of order.
    const stage = stageFor(event.stage)
    if (event.type === 'awaiting_officer') {
      // The one exception, and it is not a leaf: the hand-back is how the stage
      // ended, so it renders as the stage's footer rather than as another row.
      stage.outcome = row(event, t)
      continue
    }
    push(stage.entries, row(event, t))
  }

  // Elapsed for whatever is still going, measured now.
  for (const stage of stages) {
    if (stage.status === 'running' && stage.startedAt) stage.ms = ms(stage.startedAt, now)
    for (const step of stage.steps) {
      if (step.status === 'running' && step.startedAt) step.ms = ms(step.startedAt, now)
    }
  }

  return stages
}

/**
 * Appends an event row, folding a run of the same type into the one before it.
 *
 * <p>A six-page bundle reports six `segment` events, each one superseding the
 * last: "page 1 of 6" through "page 6 of 6". Six rows, of which only the sixth
 * says anything you did not already know. Folded, it is one row reading
 * "page 6 of 6" with a ×6 beside it — the progress is still there, and the row
 * updates in place while the run is live, which is what a progress line should do.
 *
 * <p>Consecutive only. Two runs of `segment` with an `area_started` between them
 * stay two rows, because the thing in the middle is what makes them different.
 */
function push(rows, next) {
  const last = rows[rows.length - 1]
  // Only an event folds into an event. A step between two of them is the thing
  // that makes them two different runs of progress, and it now shares this list.
  if (last && last.kind === 'event' && last.type === next.type) {
    // The newest detail wins: progress supersedes, it does not accumulate.
    last.detail = next.detail ?? last.detail
    last.info = next.info ?? last.info
    last.at = next.at
    last.seq = next.seq
    last.count = (last.count ?? 1) + 1
    return
  }
  rows.push(next)
}

/**
 * A step entry: a span, opened here and closed when its ending arrives.
 *
 * `endedAt` is passed rather than defaulted because a step can finish without ever
 * having started — skipped before it announced itself — and that row is a point in
 * time wearing a step's clothes, not a span of zero length that ran.
 */
function newStep(event, startedAt, endedAt) {
  return {
    kind: 'step',
    key: event.step,
    label: event.label || event.step,
    startedAt,
    endedAt,
    ms: endedAt == null ? null : 0,
    status: 'running',
    cacheHit: false,
  }
}

/** One leaf row: what happened, when, and the detail worth showing beside it. */
function row(event, t) {
  const { seq, type, at: _at, stage, step, detail: nested, ...rest } = event
  // Nested `detail` from the gateway (dpi, long-edge, …) is for click-to-expand,
  // not the one-liner. Older tapes without it simply have nothing to open.
  const info = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : null
  return { kind: 'event', seq, type, at: t, detail: describe(type, rest, info), info }
}

/**
 * An event in a few words.
 *
 * <p>Per-type rather than a generic key–value dump, because the point of the
 * panel is to be read at a glance. Anything without a phrasing falls back to its
 * payload, so a new event type shows up as itself rather than as a blank row.
 */
function describe(type, p, info) {
  switch (type) {
    case 'segment': return `page ${p.done} of ${p.total}`
    // Documents are read several at a time, so their steps open together and finish out
    // of order. This is the one row that says how far through the bundle the stage is.
    case 'extract': return `document ${p.done} of ${p.total}`
    case 'area_started': return p.areaId
    case 'area_done': return p.areaId
    case 'finding': return `${p.findingId} · ${p.outcome}`
    case 'gate_halted': return p.statement || p.checkId
    case 'stage_failed': return p.message
    case 'awaiting_officer': return `waiting for the officer to start ${p.next}`
    case 'stage_done': return null
    case 'cache_hit': return `answered from the ${CACHE.local.word}`
    // Tokens live only on infra model events — not on pipeline steps.
    // A call that happened. `tokensCachedIn` is the provider's prompt cache — part of
    // the input, billed at a reduced rate — so it is named as such and shown inside the
    // input figure it discounts, never as a saving of its own.
    case 'llm_call':
      return `${p.model}${p.slot ? ` (${p.slot})` : ''} · in ${tokens(p.tokensIn)}`
        + `${p.tokensCachedIn ? ` (${tokens(p.tokensCachedIn)} ${CACHE.prompt.word})` : ''}`
        + ` out ${tokens(p.tokensOut)}`
        + `${p.ms ? ` · ${elapsed(p.ms)}` : ''}${p.status && p.status !== 'OK' ? ` · ${p.status}` : ''}`
    // A call that did not happen. The sizes are the *avoided* ones, kept so a reader can
    // see what was skipped; no money, because there is none and "$0" beside a token count
    // invites the reading that the other rows' zeros mean the same thing.
    //
    // Which layer answered sits where "local cache" used to — L1 / L2 / L3/db / L3/disk —
    // so a warm in-process hit and a durable read are not the same word.
    case 'llm_cached':
      return `${p.model} · ${cacheLayerLabel(info)} · in ${tokens(p.tokensIn)} out ${tokens(p.tokensOut)}`
    default: {
      const parts = Object.entries(p).filter(([, v]) => v != null && v !== '')
      return parts.length ? parts.map(([k, v]) => `${k} ${v}`).join(' · ') : null
    }
  }
}

/**
 * Where a cached answer came from, short enough for the one-liner.
 *
 * Older events have no layer — they keep saying "local cache". New ones name the
 * tier; L3 also names its backend (db vs disk), because those are two different
 * durable stores behind the same level.
 */
function cacheLayerLabel(info) {
  const layer = info?.cacheLayer
  if (!layer) return CACHE.local.word
  if (layer === 'L3' && info.cacheStorage) {
    return `L3/${String(info.cacheStorage).toLowerCase()}`
  }
  return layer
}

/**
 * The log's palette.
 *
 * A console colours by *what a token is*, not by how important it is, and that is
 * the whole trick: once time is always grey, an identifier always teal and an
 * event type always violet, a wall of rows can be skimmed for the one shape you
 * are looking for without reading any of it.
 *
 * Chosen for a white body rather than a black one — terminal defaults are tuned
 * for dark ground and turn illegible here — so these are the darker end of each
 * hue, all at least 4.5:1 on white.
 */
export const LOG_INK = {
  time: '#8A9099',      // when — present on every row, so the quietest thing on it
  key: '#0B7285',       // a step key: an identifier, the thing you grep for
  type: '#6741D9',      // an event type: the channel, like a log level
  detail: '#4A5058',    // what it said
  label: 'var(--me-ink)',
  running: 'var(--me-blue)',
  ok: '#1F7A00',
  halted: '#B26B00',
  failed: '#B3261E',
  muted: 'var(--me-grey-70)',
}

/**
 * Token counts, grouped.
 *
 * `1468` and `14680` are the same shape at a glance and an order of magnitude
 * apart — which is the one distinction a token count exists to make. Grouping is
 * the cheapest way to make the difference visible without reading the digits.
 */
export const tokens = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'))

/**
 * The two caches, named apart wherever either one is shown.
 *
 * They are not degrees of the same thing:
 *
 *   **local**   our derivation store answered, so no call was made and nothing was
 *               billed. A saving of 100%.
 *   **prompt**  the provider recognised the prefix of a call that *did* happen and
 *               charged those input tokens at roughly a tenth of the rate. A saving
 *               of about 90%, on part of one call.
 *
 * "Not charged" was the earlier wording for the first and it forecloses the second:
 * once the panel starts reporting prompt-cache tokens, a reader who has learnt that
 * "cache" means free will read a real bill as zero. So the word is always qualified,
 * and the two are never added together — one counts calls that never happened.
 */
export const CACHE = {
  local: { word: 'local cache', title: 'Answered from the local cache — no model was asked, nothing was billed' },
  prompt: { word: 'prompt cache', title: "The provider's own prompt cache — these input tokens were billed at a reduced rate" },
}

/** Is anything still in flight? Drives whether the panel ticks. */
export const isRunning = (stages) =>
  stages.some((s) => s.status === 'running' && s.startedAt)

/** `1.4s`, `2m 06s`, `340ms` — short enough to sit at the end of a row. */
export function elapsed(millis) {
  if (millis == null) return ''
  if (millis < 1000) return `${Math.round(millis)}ms`
  if (millis < 60_000) return `${(millis / 1000).toFixed(1)}s`
  const m = Math.floor(millis / 60_000)
  const s = Math.round((millis % 60_000) / 1000)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** Wall-clock time of day, to the second. What you compare against a log line. */
export function clockTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
