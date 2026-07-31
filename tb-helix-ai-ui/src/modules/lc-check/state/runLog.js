// Folding a case's events into what actually happened.
//
// The service emits a flat, ordered stream — `{seq, type, at, ...}` — and that is
// the right shape for a wire: adding a new kind of event is a constant, not a
// schema. It is the wrong shape to read. Nobody asks "what was event 47"; they
// ask which stage is running, which step it is on, and why interpret took ninety
// seconds.
//
// So the flat tape folds into three tiers, and the tiers are what the panel
// draws:
//
//   stage   intake · interpret · gate · plan · execute · signoff
//   step      the units inside one stage — segment, extract, gate, checks
//   event       everything else, attached to whatever was open when it arrived
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

/** Events that belong to a stage as a whole rather than to a step inside it. */
const STAGE_LEVEL = new Set(['stage_started', ...Object.keys(STAGE_ENDS), 'awaiting_officer'])

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
        steps: [], events: [],
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
      Object.assign(stage, { startedAt: t, endedAt: null, ms: null, status: 'running', steps: [], events: [] })
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
      if (!event.stage && stage.startedAt == null) { stage.events.push(row(event, t)); continue }
      stage.status = STAGE_ENDS[event.type]
      stage.endedAt = t
      stage.ms = event.ms ?? ms(stage.startedAt, t)
      // A stage that ended cannot still have a step in flight. Anything left open
      // ended with it, however it ended.
      stage.steps.forEach((s) => { if (s.status === 'running') { s.status = stage.status; s.endedAt = t; s.ms = ms(s.startedAt, t) } })
      stage.events.push(row(event, t))
      if (openStage === stage) { openStage = null; openStep = null }
      continue
    }

    if (event.type === 'step_started') {
      const stage = stageFor(event.stage)
      const step = { key: event.step, label: event.label || event.step, startedAt: t, endedAt: null, ms: null, status: 'running', cacheHit: false, events: [] }
      stage.steps.push(step)
      openStage = stage
      openStep = step
      continue
    }

    if (event.type === 'step_finished') {
      const stage = stageFor(event.stage)
      let step = [...stage.steps].reverse().find((s) => s.key === event.step && s.status === 'running')
      if (!step) {
        // Finished without starting — skipped before it announced itself. Real,
        // and worth a row: "we considered this and it did not apply" is an answer.
        step = { key: event.step, label: event.label || event.step, startedAt: t, endedAt: t, ms: 0, status: 'running', cacheHit: false, events: [] }
        stage.steps.push(step)
      }
      step.status = (event.status || 'OK').toLowerCase()
      step.endedAt = t
      step.ms = event.ms || ms(step.startedAt, t)
      if (event.label) step.label = event.label
      if (openStep === step) openStep = null
      continue
    }

    if (event.type === 'cache_hit') {
      const stage = stageFor(event.stage)
      const step = [...stage.steps].reverse().find((s) => s.key === event.step)
      if (step) step.cacheHit = true
    }

    // Everything else is a leaf: it happened inside whatever was open. Kept even
    // when nothing was — an event with nowhere to go is usually the interesting one.
    const target = STAGE_LEVEL.has(event.type) || !openStep ? stageFor(event.stage) : openStep
    target.events.push(row(event, t))
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

/** One leaf row: what happened, when, and the detail worth showing beside it. */
function row(event, t) {
  const { seq, type, at: _at, stage, step, ...rest } = event
  return { seq, type, at: t, detail: describe(type, rest) }
}

/**
 * An event in a few words.
 *
 * <p>Per-type rather than a generic key–value dump, because the point of the
 * panel is to be read at a glance. Anything without a phrasing falls back to its
 * payload, so a new event type shows up as itself rather than as a blank row.
 */
function describe(type, p) {
  switch (type) {
    case 'segment': return `page ${p.done} of ${p.total}`
    case 'area_started': return p.areaId
    case 'area_done': return p.areaId
    case 'finding': return `${p.findingId} · ${p.severity}`
    case 'gate_halted': return p.statement || p.checkId
    case 'stage_failed': return p.message
    case 'awaiting_officer': return `waiting for the officer to start ${p.next}`
    case 'stage_done': return null
    case 'cache_hit': return 'answered from cache'
    default: {
      const parts = Object.entries(p).filter(([, v]) => v != null && v !== '')
      return parts.length ? parts.map(([k, v]) => `${k} ${v}`).join(' · ') : null
    }
  }
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
