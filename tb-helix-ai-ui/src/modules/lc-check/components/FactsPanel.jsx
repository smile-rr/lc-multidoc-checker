import { useState } from 'react'

// What the extractor read, laid out the way the v3 examination UI lays out its
// parse fields: label, value, confidence. Nothing else.
//
// Deliberately quiet. An officer scanning thirty values is not interested in our
// colour scheme; colour here is a claim that something needs attention, so it is
// spent only on that — a confidence chip when we are unsure, and a row tint when
// the value is actively selected. Everything certain is plain text.
//
// `ConfChip` follows the same rule as the examination UI: nothing at all for a
// high-confidence read, since that is the normal case and needs no decoration.
export default function FactsPanel({
  title,
  meta,
  facts,
  hoverAnchor,
  onHoverAnchor,
  activePage,
  onPickFact,
}) {
  const [showSource, setShowSource] = useState(false)
  const uncertain = facts.filter((f) => f.confidence && f.confidence !== 'HIGH').length

  return (
    <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>
            Extracted Fields
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
            {facts.length} fields{uncertain ? ` · ${uncertain} unsure` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{title} · {meta}</span>
          <button
            onClick={() => setShowSource((s) => !s)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--me-blue)' }}
          >
            {showSource ? 'Hide source text' : 'Show source text'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {facts.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>
            No extracted fields recorded for this document.
          </div>
        ) : (
          facts.map((f) => (
            <FactRow
              key={`${f.docId}-${f.anchorId ?? f.page}-${f.label}`}
              fact={f}
              lit={(f.anchorId && hoverAnchor === f.anchorId) || (f.page != null && activePage === f.page)}
              showSource={showSource}
              onHover={onHoverAnchor}
              onPick={onPickFact}
            />
          ))
        )}
      </div>
    </div>
  )
}

function FactRow({ fact, lit, showSource, onHover, onPick }) {
  const clickable = fact.page != null
  return (
    <div
      onMouseEnter={fact.anchorId ? () => onHover(fact.anchorId) : undefined}
      onMouseLeave={fact.anchorId ? () => onHover(null) : undefined}
      onClick={clickable ? () => onPick?.(fact) : undefined}
      style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--me-grey-08)',
        // Stays white. A grey fill on the active row read as disabled rather than
        // selected, and greyed half the panel while the officer moved through it.
        // A left accent marks position without dimming the value being read.
        background: '#fff',
        boxShadow: lit ? 'inset 2px 0 0 var(--me-blue)' : 'none',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow 120ms var(--ease-standard)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '132px 1fr auto', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{fact.label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-ink)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minWidth: 0 }}>
          {fact.value || '—'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <ConfChip conf={fact.confidence} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>{fact.source}</span>
        </span>
      </div>

      {fact.flag ? (
        <div style={{ marginTop: 4, marginLeft: 142, fontSize: 11.5, color: '#946400', lineHeight: 1.45 }}>{fact.flag}</div>
      ) : null}

      {showSource && fact.sourceText ? (
        <div
          style={{
            marginTop: 6,
            marginLeft: 142,
            padding: '6px 8px',
            background: '#fff',
            borderLeft: '2px solid var(--me-grey-20)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.6,
            color: 'var(--me-grey)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {fact.sourceText}
        </div>
      ) : null}
    </div>
  )
}

// Nothing for a high-confidence read: that is the normal case. Amber when the
// extractor was unsure, red when it barely read it at all.
function ConfChip({ conf }) {
  if (!conf || conf === 'HIGH') return null
  const med = conf === 'MED'
  return (
    <span
      title={med ? 'Medium confidence — worth a glance' : 'Low confidence — check the original'}
      style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        padding: '1px 4px',
        borderRadius: 3,
        color: med ? '#8a5700' : '#cc0011',
        background: med ? '#fefce8' : '#fff1f0',
      }}
    >
      {conf}
    </span>
  )
}
