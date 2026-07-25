import { Link } from 'react-router-dom'
import Badge from '@shared/ds/Badge'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import SegmentedControl from '@shared/ds/SegmentedControl'
import { money, durationShort, thousands, usd, dueLabel } from '@shared/lib/format'

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
  runMode,
  onRunMode,
  cost,
  onToggleCost,
  costOpen,
  onToggleAsk,
  askOpen,
  actionLabel,
  onAction,
  headerRef,
}) {
  const c = detail.credit
  const facts = [
    { k: 'Credit', v: c.creditRef, mono: true },
    { k: 'Amount', v: `${money(c.currency, c.amount)} ±${c.tolerancePct}%`, mono: true, weight: 500 },
    { k: 'Applicant', v: c.applicant },
    { k: 'Documents', v: `${detail.documents.filter((d) => d.role === 'presented').length} of ${detail.bundlePages.length} pages` },
    { k: 'Expiry', v: c.expiry },
    { k: 'Reply due', v: dueLabel(detail.replyDueDays) ?? '—', weight: 600, urgent: true },
  ]

  const costPill = `${durationShort(cost.wallClock)} · ${thousands(cost.tokens)} · ${usd(cost.cost)}`

  return (
    <header
      ref={headerRef}
      style={{ background: '#fff', borderBottom: '1px solid var(--me-grey-15)', padding: '18px 32px 0', position: 'sticky', top: 0, zIndex: 20 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px 28px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--me-grey-70)', flexWrap: 'wrap' }}>
            <Link to="/lc-check/cases">Cases</Link>
            <span>/</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{caseId}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--me-ink)' }}>{c.beneficiary}</h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', margin: '4px 0 14px', border: '1px solid var(--me-grey-15)', borderRadius: 8, background: 'var(--me-grey-08)', overflow: 'hidden', width: 'fit-content' }}>
            {facts.map((f, i) => (
              <div key={f.k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', borderRight: i < facts.length - 1 ? '1px solid var(--me-grey-15)' : 'none', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{f.k}</span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-sans)',
                    fontWeight: f.weight || 400,
                    color: f.urgent && detail.replyDueDays != null && detail.replyDueDays <= 3 ? 'var(--status-warning)' : 'var(--me-ink)',
                  }}
                >
                  {f.v}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
          <PillButton title="Time, tokens and cost for this case" active={costOpen} onClick={onToggleCost}>
            <Icon name="gauge" size={15} color={cost.tokens ? 'var(--me-blue)' : 'var(--me-grey-70)'} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)' }}>{costPill}</span>
          </PillButton>

          <PillButton title="Ask about this case" active={askOpen} onClick={onToggleAsk}>
            <Icon name="message-circle" size={15} />
            <span style={{ fontSize: 12.5, color: 'var(--me-grey)' }}>Ask</span>
          </PillButton>

          <SegmentedControl
            size="sm"
            value={runMode}
            onChange={onRunMode}
            items={[
              { id: 'auto', label: 'Auto', tip: 'Run every review area straight through, then open the report' },
              { id: 'step', label: 'Step', tip: 'Pause after each review area so you can read it before the next one runs' },
            ]}
          />

          <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600 }}>
            MK
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {stages.map((s, i) => {
          const active = s.id === activeStage
          const past = i < stages.findIndex((x) => x.id === activeStage)
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
                color: active ? 'var(--me-ink)' : past ? 'var(--me-grey)' : 'var(--me-grey-70)',
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
                  background: active ? 'var(--me-blue)' : past ? 'var(--me-green-20)' : 'var(--me-grey-15)',
                  color: active ? '#fff' : past ? '#1F7A00' : 'var(--me-grey-70)',
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
            <Button size="sm" onClick={onAction}>{actionLabel}</Button>
          </div>
        ) : null}
      </div>
    </header>
  )
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
