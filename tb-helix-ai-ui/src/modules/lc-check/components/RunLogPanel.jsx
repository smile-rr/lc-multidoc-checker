import { useEffect, useState } from 'react'
import FloatingPanel from '@shared/ds/FloatingPanel'
import Icon from '@shared/ds/Icon'
import Badge from '@shared/ds/Badge'
import { ellipsis } from '@shared/ds/text'
import useRunLog from '../state/useRunLog'
import { foldRunLog, isRunning, elapsed, clockTime, LOG_INK } from '../state/runLog'

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
// **Two tiers, not three.** The stage is the only container:
//   stage   a banded header — the unit an officer starts and waits on
//   rows    everything the stage reported, in the order it reported it
//
// A row is a step or an event and differs only in how it is drawn: a step names
// what the examination did and carries a duration, an event is a moment inside
// it — small, monospaced, dimmer. They share one rail, because the sequence
// between them is the information. Nesting events under the step that happened to
// be open put every event that belonged to no step at the foot of the stage, where
// a finding raised at 18:32 rendered below a check that ran at 18:33.
//
// It reads top-down in time, oldest first, because the question is "what
// happened" and not "what happened last". A run in flight pins its live elapsed
// times, which tick; a finished run is static and costs nothing.

const STAGE_LABELS = {
  intake: 'Intake', interpret: 'Interpret', gate: 'Gate',
  plan: 'Plan', execute: 'Execute', signoff: 'Sign-off',
}

const STATUS = {
  running: { tone: 'blue', label: 'Running', icon: 'loader', color: LOG_INK.running },
  done: { tone: 'success', label: 'Done', icon: 'check', color: LOG_INK.ok },
  ok: { tone: 'success', label: 'Done', icon: 'check', color: LOG_INK.ok },
  halted: { tone: 'warning', label: 'Halted', icon: 'octagon-alert', color: LOG_INK.halted },
  failed: { tone: 'error', label: 'Failed', icon: 'triangle-alert', color: LOG_INK.failed },
  skipped: { tone: 'neutral', label: 'Skipped', icon: 'minus', color: LOG_INK.muted },
  // Events that named no stage and arrived with none open. Older tapes have them.
  unplaced: { tone: 'neutral', label: 'Unattributed', icon: 'minus', color: LOG_INK.muted },
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

      {/* One list, in the order things happened. A step and an event are both rows
          on the same rail and differ only in how they are drawn — a step names what
          the examination did and holds a duration; an event is a moment inside it.
          Sorting them into separate blocks made the second kind read as though it
          all happened at the end. */}
      <div style={{ padding: '2px 0 8px' }}>
        {stage.entries.map((entry, i) => (
          entry.kind === 'step'
            ? <StepRow key={`s-${entry.key}-${i}`} step={entry} />
            : <EventRow key={`e-${entry.seq}`} event={entry} />
        ))}
        {stage.outcome && <StageOutcome event={stage.outcome} />}
        {!stage.entries.length && !stage.outcome && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'var(--me-grey-70)' }}>No steps reported.</div>
        )}
      </div>
    </section>
  )
}

// Stage hand-back / halt — same horizontal column as the stage header (20px),
// not the step rail. Bare EventRows with inset looked "out of line" under steps.
function StageOutcome({ event }) {
  const waiting = event.type === 'awaiting_officer'
  const halted = event.type === 'gate_halted' || event.type === 'stage_failed'
  const tone = waiting ? LOG_INK.muted : halted ? LOG_INK.halted : LOG_INK.label
  const label = waiting
    ? (event.detail || 'Waiting for the officer')
    : event.detail || event.type
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      margin: '8px 20px 4px',
      padding: '8px 12px',
      borderRadius: 6,
      background: 'var(--me-grey-08)',
      borderLeft: `3px solid ${waiting ? 'var(--me-grey-40)' : tone}`,
      fontSize: 12,
    }}>
      <Icon
        name={waiting ? 'pause' : halted ? 'octagon-alert' : 'circle-alert'}
        size={13}
        color={tone}
      />
      <span style={{ color: LOG_INK.label, fontWeight: 600, minWidth: 0, ...ellipsis }}>
        {label}
      </span>
      <span style={{ flex: 1 }} />
      <Clock at={event.at} ms={null} />
    </div>
  )
}

// ---- Tier 2: the step ------------------------------------------------------
//
// A rule down the left says "inside the stage above" without an indent guessing
// game, and gives the running state something to colour.
//
// No tokens here. Spend belongs on infra events ({@code llm_call} / {@code llm_cached});
// a pipeline step is "what the examination did", not "what the model charged".
function StepRow({ step }) {
  const s = statusOf(step.status)
  return (
    <Rail color={step.status === 'running' ? s.color : 'var(--me-grey-15)'}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0 2px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: LOG_INK.key, fontWeight: 600, flexShrink: 0 }}>
          {step.key}
        </span>
        <span style={{ fontSize: 13, color: LOG_INK.label, minWidth: 0, ...ellipsis }}>{step.label}</span>
        {step.cacheHit && (
          <span title="Answered from cache — no model was asked" style={{ display: 'inline-flex', flexShrink: 0 }}>
            <Icon name="zap" size={12} color={LOG_INK.ok} />
          </span>
        )}
        {step.status !== 'ok' && step.status !== 'running' && (
          <Badge tone={s.tone}>{s.label}</Badge>
        )}
        <span style={{ flex: 1 }} />
        <Clock at={step.startedAt} ms={step.ms} running={step.status === 'running'} />
      </div>
    </Rail>
  )
}

/**
 * The column every row inside a stage sits in.
 *
 * Shared by steps and events so the two line up as one sequence. When each kind
 * drew its own indent they read as two lists that happened to be adjacent, which
 * is precisely the reading to avoid — the order between them is the point.
 */
function Rail({ color = 'var(--me-grey-15)', children }) {
  return (
    <div style={{ margin: '0 20px', borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
      {children}
    </div>
  )
}

// ---- Tier 3: the event -----------------------------------------------------
//
// Deliberately quiet. There are far more of these than of anything else, and
// they are read by scanning rather than line by line.
//
// Model calls carry a nested `info` (dpi, long-edge, page bytes, …) from the
// gateway. The one-liner stays short; a click opens the rest under the row so
// the floating panel does not become a wall of context.
function EventRow({ event }) {
  const [open, setOpen] = useState(false)
  const expandable = event.info && Object.keys(event.info).length > 0
  return (
    <Rail>
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
        onKeyDown={expandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } } : undefined}
        title={expandable ? (open ? 'Hide details' : 'Show details') : undefined}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0 2px', fontSize: 11.5,
          cursor: expandable ? 'pointer' : undefined,
          borderRadius: 4,
          background: open ? 'var(--me-grey-08)' : undefined,
        }}
      >
        {expandable ? (
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} color={LOG_INK.time} />
        ) : null}
        <span style={{ fontFamily: 'var(--font-mono)', color: LOG_INK.type, flexShrink: 0 }}>
          {event.type}
        </span>
        {event.detail && (
          <span style={{ color: LOG_INK.detail, minWidth: 0, ...ellipsis }}>{event.detail}</span>
        )}
        {event.count > 1 && (
          <span title={`${event.count} of these, in a row`}
                style={{ fontFamily: 'var(--font-mono)', color: LOG_INK.time, flexShrink: 0 }}>
            ×{event.count}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Clock at={event.at} ms={null} />
      </div>
      {open && expandable ? <EventDetail info={event.info} /> : null}
    </Rail>
  )
}

/** Preferred order for vision / slot knobs — anything else follows alphabetically. */
const DETAIL_ORDER = [
  'dpi', 'maxLongEdgePx', 'maxPages', 'pages', 'pageLabels', 'imageBytes',
  'renderProfile', 'temperature', 'maxTokens', 'baseUrl', 'scope', 'modelId',
]

function EventDetail({ info }) {
  const keys = Object.keys(info).sort((a, b) => {
    const ia = DETAIL_ORDER.indexOf(a)
    const ib = DETAIL_ORDER.indexOf(b)
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    return a.localeCompare(b)
  })
  return (
    <div style={{
      margin: '2px 0 6px 16px',
      padding: '6px 10px',
      borderRadius: 6,
      background: 'var(--me-grey-08)',
      borderLeft: '2px solid var(--me-grey-15)',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      columnGap: 12,
      rowGap: 3,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      {keys.map((k) => (
        <FragmentPair key={k} k={k} v={info[k]} />
      ))}
    </div>
  )
}

function FragmentPair({ k, v }) {
  const shown = Array.isArray(v) ? v.join(', ')
    : k === 'imageBytes' && typeof v === 'number' ? formatBytes(v)
    : String(v)
  return (
    <>
      <span style={{ color: LOG_INK.time }}>{k}</span>
      <span style={{ color: LOG_INK.detail, minWidth: 0, wordBreak: 'break-all' }}>{shown}</span>
    </>
  )
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/** Reserved width clock; events rarely have a duration. */
function Clock({ at, ms, running, strong }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <span style={{ color: LOG_INK.time }}>{clockTime(at)}</span>
      {/* Reserved even when empty — an event has a time but no duration, and if the
          slot collapsed the timestamps above and below it would not line up. */}
      <span style={{
        color: running ? LOG_INK.running : LOG_INK.muted,
        fontWeight: strong ? 600 : 500,
        minWidth: 46, textAlign: 'right',
      }}>
        {ms == null ? '' : elapsed(ms)}
      </span>
    </span>
  )
}

const Note = ({ children }) => (
  <div style={{ padding: '28px 22px', fontSize: 13, color: 'var(--me-grey-70)', lineHeight: 1.55 }}>{children}</div>
)
