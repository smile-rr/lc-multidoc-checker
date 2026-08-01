import Eyebrow from '@shared/ds/Eyebrow'
import { Link } from 'react-router-dom'
import Badge from '@shared/ds/Badge'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import InfoTip from '@shared/ds/InfoTip'
import SegmentedControl from '@shared/ds/SegmentedControl'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { money, durationShort, usd, dueLabel } from '@shared/lib/format'
import { RUN_MODES } from '../state/stages'

// The case header — breadcrumb, identity, the facts an officer keeps re-reading,
// and the stage tabs.
//
// This lives in the module, not the platform shell, on purpose: it is entirely
// LC vocabulary. The shell owns the rail and the frame; the moment it owned this
// it would know what a credit is, and governance could no longer share it.
export default function CaseHeader({
  caseId,
  detail,
  status,
  stages,
  activeStage,
  onStage,
  // Per-tab run progress (`done` | `running` | `pending`). Selection is the
  // underline; this is what paints the number. Absent → every tab pending.
  progress = {},
  runMode,
  onRunMode,
  cost,
  onToggleCost,
  costOpen,
  onToggleAsk,
  askOpen,
  onToggleLog,
  logOpen,
  runBusy = false,
  actionLabel,
  actionDisabled,
  onAction,
}) {
  // The facts strip is the reference an officer re-reads while working, but it
  // is also a band of chrome above every stage, and once the credit is in your
  // head it is a band you scroll past on every screen. So it folds, and the
  // choice persists: this is a habit, not a per-case decision. The reply
  // deadline does not fold with it — see below.
  const [factsOpen, setFactsOpen] = usePersistedState('lcCheck.caseFacts', true)

  const c = detail.credit
  const dueUrgent = detail.replyDueDays != null && detail.replyDueDays <= 3

  // The credit is read by intake, after the case exists — so for the first
  // seconds of a case's life these fields have no answer yet. Blank is the wrong
  // way to say that: an empty Amount reads as a credit with no amount, which is
  // a discrepancy, not a pending read. So each one says it is still being read
  // until it is not.
  const reading = !c.creditRef
  const held = (value) => (reading ? '·  ·  ·' : value)
  // Tolerance comes from :39A:. Show it only when the credit states one —
  // appending `±0%` when the field is absent made every amount look tolerant.
  const amount = reading
    ? held(null)
    : c.tolerancePct
      ? `${money(c.currency, c.amount)} ±${c.tolerancePct}%`
      : money(c.currency, c.amount)
  // Applicant stays after Amount (original order) but is capped so Documents /
  // Expiry / Reply Due do not shift. Full :50: text is on the InfoTip — hover,
  // focus or click — rather than a native title= which truncates long addresses.
  const facts = [
    { k: 'Credit', v: held(c.creditRef), mono: true },
    { k: 'Amount', v: amount, mono: true, weight: 500 },
    { k: 'Applicant', v: held(c.applicant), trim: true, tip: !reading && c.applicant },
    { k: 'Documents', v: `${detail.documents.filter((d) => d.role === 'presented').length} of ${detail.bundlePages.length} pages` },
    { k: 'Expiry', v: held(c.expiry) },
    { k: 'Reply Due', v: dueLabel(detail.replyDueDays) ?? '—', weight: 600, urgent: true },
  ]

  // Time and money, not tokens. An officer acts on both of these and on neither
  // token count; and tokens beside a price is the same fact twice in two units,
  // the second of which needs a rate card to read. Worse, they do not track each
  // other — 38k tokens on GPT-4o and 38k on Qwen3 are an order of magnitude
  // apart in cost — so showing them adjacent invites exactly the wrong inference.
  // Tokens still earn their place in the drawer, where they explain a number
  // rather than restate it: per step, split in/out, next to cache and retries.
  const costPill = `${durationShort(cost.wallClock)} · ${usd(cost.cost)}`

  return (
    <header
      style={{ background: '#fff', borderBottom: '1px solid var(--me-grey-15)', padding: '18px 32px 0', position: 'sticky', top: 0, zIndex: 20 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px 28px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--me-grey-70)', flexWrap: 'wrap' }}>
            <Link to="/lc-check/cases">Cases</Link>
            <span>/</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{caseId}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {/* Folded away, the deadline comes up here rather than going with
                the rest. Everything else in the strip is reference; this one is
                a clock, and it must not be possible to hide it. */}
            {!factsOpen && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: dueUrgent ? 'var(--status-warning)' : 'var(--me-grey)' }}>
                <span style={{ color: 'var(--me-grey-70)' }}>Reply due</span>
                <strong style={{ fontWeight: 600 }}>{dueLabel(detail.replyDueDays) ?? '—'}</strong>
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: reading ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>
            {reading ? 'Reading the credit…' : c.beneficiary}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
          <PillButton
            title={factsOpen ? 'Hide the credit details' : 'Show the credit details'}
            active={!factsOpen}
            onClick={() => setFactsOpen((o) => !o)}
          >
            <Icon name={factsOpen ? 'chevrons-down-up' : 'chevrons-up-down'} size={15} color="var(--me-grey-70)" />
            <span style={{ fontSize: 12.5, color: 'var(--me-grey)' }}>Details</span>
          </PillButton>

          <PillButton title="Time and cost for this case — open for the per-step breakdown" active={costOpen} onClick={onToggleCost}>
            <Icon name="gauge" size={15} color={cost.cost ? 'var(--me-blue)' : 'var(--me-grey-70)'} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)' }}>{costPill}</span>
          </PillButton>

          {/* Beside the cost, because they answer the two halves of the same
              question — what the run spent, and what it was doing while it spent it. */}
          <PillButton title="What this examination has done, stage by stage" active={logOpen} onClick={onToggleLog}>
            <Icon name="activity" size={15} color={runBusy ? 'var(--me-blue)' : 'var(--me-grey-70)'} />
            <span style={{ fontSize: 12.5, color: 'var(--me-grey)' }}>Log</span>
          </PillButton>

          <PillButton title="Ask about this case" active={askOpen} onClick={onToggleAsk}>
            <Icon name="message-circle" size={15} />
            <span style={{ fontSize: 12.5, color: 'var(--me-grey)' }}>Ask</span>
          </PillButton>

          <SegmentedControl size="sm" value={runMode} onChange={onRunMode} items={RUN_MODES} />

          <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600 }}>
            MK
          </div>
        </div>
      </div>

      {/* Full width under the title row. It used to sit inside the left flex
          column beside the action pills, so `flex-wrap` broke Documents /
          Expiry / Reply Due onto a second line whenever Applicant's address
          ran long — while the right half of the header still looked empty. */}
      {factsOpen && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            margin: '10px 0 14px',
            border: '1px solid var(--me-grey-15)',
            borderRadius: 8,
            background: 'var(--me-grey-08)',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {facts.map((f, i) => {
            const color = reading && f.v === '·  ·  ·'
              ? 'var(--me-grey-50)'
              : f.urgent && dueUrgent ? 'var(--status-warning)' : 'var(--me-ink)'
            // 220 cell − 32 horizontal padding. Fixed so the InfoTip button
            // (which sizes to its label) cannot grow past the cap and defeat
            // the ellipsis.
            const valueStyle = {
              fontSize: 13.5,
              fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-sans)',
              fontWeight: f.weight || 400,
              color,
              whiteSpace: 'nowrap',
              overflow: f.trim ? 'hidden' : undefined,
              textOverflow: f.trim ? 'ellipsis' : undefined,
              display: 'block',
              maxWidth: f.trim ? 188 : undefined,
            }
            return (
              <div
                key={f.k}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '8px 16px',
                  borderRight: i < facts.length - 1 ? '1px solid var(--me-grey-15)' : 'none',
                  minWidth: 0,
                  flex: '0 0 auto',
                  maxWidth: f.trim ? 220 : undefined,
                }}
              >
                <Eyebrow size="sm">{f.k}</Eyebrow>
                {f.tip ? (
                  <InfoTip title="Applicant" label={<span style={valueStyle}>{f.v}</span>}>
                    <span style={{ whiteSpace: 'pre-line' }}>{f.tip}</span>
                  </InfoTip>
                ) : (
                  <span style={valueStyle}>{f.v}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {stages.map((s, i) => {
          // Selection and progress are two channels. The underline + weight say
          // "you are here"; the number says "has this run". Colouring the number
          // for selection stole the only signal that could tell done from pending.
          const active = s.id === activeStage
          const state = progress[s.id] ?? 'pending'
          const num = NUMBER_TONE[state] ?? NUMBER_TONE.pending
          return (
            <button
              key={s.id}
              onClick={() => onStage(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '11px 16px 13px',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--me-blue)' : 'transparent'}`,
                color: active ? 'var(--me-ink)' : state === 'done' ? 'var(--me-grey)' : 'var(--me-grey-70)',
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
              }}
            >
              <span
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                  background: num.bg,
                  color: num.fg,
                }}
              >
                {i + 1}
              </span>
              <span>{s.label}</span>
            </button>
          )
        })}
        {actionLabel ? (
          <div style={{ marginLeft: 'auto', paddingBottom: 8 }}>
            <Button size="sm" disabled={actionDisabled} onClick={onAction}>{actionLabel}</Button>
          </div>
        ) : null}
      </div>
    </header>
  )
}

// Number tone is progress only — never selection. Blue here means the stage is
// running right now; green means it has finished; grey means it has not started.
const NUMBER_TONE = {
  done: { bg: 'var(--me-green-20)', fg: '#1F7A00' },
  running: { bg: 'var(--me-blue)', fg: '#fff' },
  pending: { bg: 'var(--me-grey-15)', fg: 'var(--me-grey-70)' },
}

function PillButton({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid var(--me-grey-15)',
        background: active ? 'var(--me-blue-20)' : '#fff',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
