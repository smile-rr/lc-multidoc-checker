import { useEffect, useState } from 'react'
import FloatingPanel from '@shared/ds/FloatingPanel'
import Icon from '@shared/ds/Icon'
import Badge from '@shared/ds/Badge'
import { ellipsis } from '@shared/ds/text'
import useRunLog from '../state/useRunLog'
import { foldRunLog, isRunning, elapsed, clockTime } from '../state/runLog'

// Run log — what the examination did, while it does it.
//
// The workbench already says where a case *is*. What it has never said is what
// it has been doing: a stage takes ninety seconds behind one line of status, and
// the difference between reading six pages and hanging on the second is invisible
// until it times out. This is that difference, at three depths.
//
// **A floating panel, not a drawer.** A drawer greys out the page and takes the
// keyboard, which is exactly wrong for something whose whole purpose is to be
// watched while the run it is describing changes the screen behind it. So it
// floats, nothing under it is disabled, and it minimises to its title bar —
// where the status line keeps saying which stage is running and for how long.
// Drag the header to move it off whatever it is covering.
//
// **The three tiers are drawn as three tiers, not as one list with indentation.**
//   stage   a banded header — the unit an officer starts and waits on
//   step    a row with a rule down its left, inside the band
//   event   small, monospaced, dimmer — the things a step reports as it goes
//
// It reads top-down in time, oldest first, because the question is "what
// happened" and not "what happened last". A run in flight pins its live elapsed
// times, which tick; a finished run is static and costs nothing.

const STAGE_LABELS = {
  intake: 'Intake', interpret: 'Interpret', gate: 'Gate',
  plan: 'Plan', execute: 'Execute', signoff: 'Sign-off',
}

const STATUS = {
  running: { tone: 'blue', label: 'Running', icon: 'loader', color: 'var(--me-blue)' },
  done: { tone: 'success', label: 'Done', icon: 'check', color: '#1F7A00' },
  ok: { tone: 'success', label: 'Done', icon: 'check', color: '#1F7A00' },
  halted: { tone: 'warning', label: 'Halted', icon: 'octagon-alert', color: '#B26B00' },
  failed: { tone: 'error', label: 'Failed', icon: 'triangle-alert', color: '#B3261E' },
  skipped: { tone: 'neutral', label: 'Skipped', icon: 'minus', color: 'var(--me-grey-70)' },
  // Events that named no stage and arrived with none open. Older tapes have them.
  unplaced: { tone: 'neutral', label: 'Unattributed', icon: 'minus', color: 'var(--me-grey-70)' },
}
const statusOf = (key) => STATUS[key] ?? STATUS.running

export default function RunLogPanel({ open, onClose, caseId }) {
  const { events, state } = useRunLog(caseId, open)

  // One clock for the whole panel, and only while something is actually running.
  // A per-row timer would be a dozen intervals redrawing a finished run forever.
  const [now, setNow] = useState(() => Date.now())
  const stages = foldRunLog(events, now)
  const live = isRunning(stages)

  useEffect(() => {
    if (!open || !live) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open, live])

  const total = stages.reduce((sum, s) => sum + (s.ms ?? 0), 0)

  // What the title bar says, and therefore the whole panel when it is minimised.
  // The running stage and its step, because that is what somebody minimises it to
  // keep an eye on; the totals only when nothing is in flight.
  const running = stages.find((s) => s.status === 'running')
  const runningStep = running?.steps.find((s) => s.status === 'running')
  const status = state === 'loading' ? 'Loading…'
    : state === 'failed' ? 'Log unavailable'
      : !stages.length ? 'Nothing has run yet'
        : running
          ? `${STAGE_LABELS[running.key] ?? running.key}${runningStep ? ` · ${runningStep.label}` : ''} · ${elapsed(running.ms)}`
          : `${stages.length} stage${stages.length === 1 ? '' : 's'} · ${elapsed(total)}`

  return (
    <FloatingPanel
      id="lc-check-run-log"
      open={open}
      onClose={onClose}
      title="Run log"
      status={status}
      width={640}
      // A history is a list, and a list wants length. Six documents read is nine
      // rows before the stage above it is even on screen — so it opens tall, and
      // the corner resizes it from there.
      height={620}
    >
      {state === 'failed' ? (
        <Note>The event log could not be loaded. The examination is unaffected — this panel reads a record of it.</Note>
      ) : !stages.length ? (
        <Note>
          {state === 'loading'
            ? 'Reading the log…'
            : 'This case has not reported anything yet. Start a stage and its steps appear here as they run.'}
        </Note>
      ) : (
        <div style={{ padding: '4px 0 24px' }}>
          {stages.map((stage) => <StageBand key={stage.key + stage.startedAt} stage={stage} />)}
        </div>
      )}
    </FloatingPanel>
  )
}

// ---- Tier 1: the stage -----------------------------------------------------
//
// A band with its own background, so the eye can find the boundary between two
// stages without counting indentation.
function StageBand({ stage }) {
  const s = statusOf(stage.status)
  return (
    <section style={{ borderBottom: '1px solid var(--me-grey-15)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 20px', background: 'var(--me-grey-08)',
          position: 'sticky', top: 0, zIndex: 1,
        }}
      >
        <Icon name={s.icon} size={15} color={s.color} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--me-ink)', letterSpacing: '-0.01em' }}>
          {STAGE_LABELS[stage.key] ?? stage.label}
        </span>
        <Badge tone={s.tone}>{s.label}</Badge>
        <span style={{ flex: 1 }} />
        <Clock at={stage.startedAt} ms={stage.ms} running={stage.status === 'running'} strong />
      </header>

      <div style={{ padding: '2px 0 8px' }}>
        {stage.steps.map((step, i) => <StepRow key={`${step.key}-${i}`} step={step} />)}
        {/* Stage-level events — the halt, the hand-back — sit under its steps
            rather than inside one, because they are not any step's doing. */}
        {stage.events.map((ev) => <EventRow key={ev.seq} event={ev} inset={20} />)}
        {!stage.steps.length && !stage.events.length && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'var(--me-grey-70)' }}>No steps reported.</div>
        )}
      </div>
    </section>
  )
}

// ---- Tier 2: the step ------------------------------------------------------
//
// A rule down the left says "inside the stage above" without an indent guessing
// game, and gives the running state something to colour.
function StepRow({ step }) {
  const s = statusOf(step.status)
  return (
    <div style={{ margin: '0 20px', borderLeft: `2px solid ${step.status === 'running' ? s.color : 'var(--me-grey-15)'}`, paddingLeft: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0 2px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', flexShrink: 0 }}>
          {step.key}
        </span>
        <span style={{ fontSize: 13, color: 'var(--me-ink)', minWidth: 0, ...ellipsis }}>{step.label}</span>
        {step.cacheHit && (
          <span title="Answered from cache — no model was asked" style={{ display: 'inline-flex', flexShrink: 0 }}>
            <Icon name="zap" size={12} color="#1F7A00" />
          </span>
        )}
        {step.status !== 'ok' && step.status !== 'running' && (
          <Badge tone={s.tone}>{s.label}</Badge>
        )}
        <span style={{ flex: 1 }} />
        <Clock at={step.startedAt} ms={step.ms} running={step.status === 'running'} />
      </div>
      {step.events.map((ev) => <EventRow key={ev.seq} event={ev} />)}
    </div>
  )
}

// ---- Tier 3: the event -----------------------------------------------------
//
// Deliberately quiet. There are far more of these than of anything else, and
// they are read by scanning rather than line by line.
function EventRow({ event, inset = 0 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0 2px', paddingLeft: inset, fontSize: 11.5 }}>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--me-grey-50)', flexShrink: 0 }}>
        {clockTime(event.at)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--me-grey-70)', flexShrink: 0 }}>
        {event.type}
      </span>
      {event.detail && (
        <span style={{ color: 'var(--me-grey)', minWidth: 0, ...ellipsis }}>{event.detail}</span>
      )}
    </div>
  )
}

/**
 * When it started and how long it took.
 *
 * Both, because they answer different questions — the clock time is what you
 * line up against a log or another system, and the elapsed is what tells you
 * where the run went.
 */
function Clock({ at, ms, running, strong }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--me-grey-50)' }}>{clockTime(at)}</span>
      <span style={{
        color: running ? 'var(--me-blue)' : 'var(--me-grey-70)',
        fontWeight: strong ? 600 : 500,
        minWidth: 46, textAlign: 'right',
      }}>
        {elapsed(ms)}
      </span>
    </span>
  )
}

const Note = ({ children }) => (
  <div style={{ padding: '28px 22px', fontSize: 13, color: 'var(--me-grey-70)', lineHeight: 1.55 }}>{children}</div>
)
