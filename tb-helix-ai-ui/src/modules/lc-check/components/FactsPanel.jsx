import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import MarkdownDoc from '@shared/ds/MarkdownDoc'
import { useMemo, useState } from 'react'
import MarksPanel from './MarksPanel'

// The presence answers, for deciding whether the Marks tab wants attention. A flag on one
// of these is the attest pass contradicting itself — it concluded "unsigned" and then
// listed a signature — and that is a human's call, not something to resolve silently.
const PRESENCE_KEYS = new Set([
  'signed',
  'seal_present',
  'corrections_present',
  'original_marking',
  'endorsement_present',
])

// What the reading produced — four views for presented documents, one for the credit:
//
//   Fields   structured values (the working view)
//   Marks    signatures, seals and corrections — read from the page, not from its text
//   Layout   full-page markdown (fallback when a named field was thin)
//   Source   the fields as JSON (what the model returned, not a second prose dump)
//
// Marks are a tab rather than a panel below because they answer a different question
// about the same document, and the officer is either reading what it says or checking
// how it was executed — rarely both at once.
//
// The credit is SWIFT-parsed, not vision-extracted: Fields only — no Marks, no Layout,
// no Source. A wire message has no page to carry a signature.
//
// Deliberately quiet. Colour is spent only on uncertainty (ConfChip) and selection.
export default function FactsPanel({
  title,
  meta,
  metaTitle,
  facts,
  marks = [],
  attested = false,
  layoutMd,
  isCredit = false,
  hoverAnchor,
  onHoverAnchor,
  activePage,
  onPickFact,
  onPickPage,
}) {
  const [view, setView] = useState('fields') // fields | marks | layout | source
  const hasLayout = !isCredit && !!(layoutMd && layoutMd.trim())
  const showTabs = !isCredit
  const uncertain = facts.filter((f) => f.confidence && f.confidence !== 'HIGH').length
  const unread = marks.filter((m) => !m.legible || !m.readsAs).length
  // What an officer must resolve by hand: a mark that is there and cannot be read, or a
  // presence answer that contradicts the marks listed beside it. Nothing else earns hue.
  const needsEye = unread > 0 || facts.some((f) => f.fieldKey && f.flag && PRESENCE_KEYS.has(f.fieldKey))

  const sourceJson = useMemo(() => {
    const rows = facts.map((f) => {
      const row = { label: f.label, value: f.value ?? '' }
      if (f.fieldKey) row.key = f.fieldKey
      if (f.confidence && f.confidence !== 'HIGH') row.confidence = f.confidence
      if (f.page != null) row.page = f.page
      if (f.source) row.source = f.source
      return row
    })
    return JSON.stringify(rows, null, 2)
  }, [facts])

  const tabs = showTabs
    ? [
        { id: 'fields', label: 'Fields' },
        // Always present, never conditional. A tab that appears and disappears with the
        // document type reads as a bug, and its absence hid a real distinction: examined
        // and clean is a conclusion, not examined is a gap. The panel says which.
        { id: 'marks', label: 'Marks', count: attested ? marks.length : null, dot: needsEye },
        ...(hasLayout ? [{ id: 'layout', label: 'Layout' }] : []),
        { id: 'source', label: 'Source' },
      ]
    : []

  const active = showTabs ? (tabs.some((t) => t.id === view) ? view : 'fields') : 'fields'

  const eyebrow = active === 'marks' ? 'Marks'
    : active === 'layout' ? 'Layout'
      : active === 'source' ? 'Source' : 'Fields'
  const count = active === 'marks'
    ? (attested
        ? `${marks.length} marks${unread ? ` · ${unread} not legible` : ''}`
        : 'not examined')
    : active === 'layout'
      ? `${layoutMd.length.toLocaleString()} chars`
      : active === 'source'
        ? `${facts.length} fields · JSON`
        : `${facts.length} fields${uncertain ? ` · ${uncertain} unsure` : ''}`

  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
            {count}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
          <span title={metaTitle || undefined} style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{title} · {meta}</span>
          {tabs.length > 0 ? (
            <span style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 6, background: 'var(--me-grey-08)', flexShrink: 0 }}>
              {tabs.map((t) => (
                <TabBtn key={t.id} active={active === t.id} onClick={() => setView(t.id)}
                        count={t.count} dot={t.dot}>
                  {t.label}
                </TabBtn>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {active === 'marks' ? (
          <MarksPanel
            marks={marks}
            facts={facts}
            attested={attested}
            activePage={activePage}
            onPickPage={onPickPage}
          />
        ) : active === 'layout' ? (
          <div style={{ padding: 10 }}>
            <MarkdownDoc
              text={layoutMd}
              label="Layout"
              meta="Full-page reading"
              defaultView="rendered"
            />
          </div>
        ) : active === 'source' ? (
          facts.length === 0 ? (
            <Empty>No fields to show as source yet.</Empty>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                lineHeight: 1.55,
                color: 'var(--me-ink)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {sourceJson}
            </pre>
          )
        ) : facts.length === 0 ? (
          <Empty>
            No extracted fields recorded for this document.
            {hasLayout ? ' Open Layout for the full-page reading.' : ''}
          </Empty>
        ) : (
          facts.map((f) => (
            <FactRow
              key={`${f.docId}-${f.anchorId ?? f.page}-${f.label}`}
              fact={f}
              lit={(f.anchorId && hoverAnchor === f.anchorId) || (f.page != null && activePage === f.page)}
              onHover={onHoverAnchor}
              onPick={onPickFact}
            />
          ))
        )}
      </div>
    </div>
  )
}

function Empty({ children }) {
  return (
    <div style={{ padding: 14, fontSize: 12, color: 'var(--me-grey-70)', fontStyle: 'italic' }}>
      {children}
    </div>
  )
}

function TabBtn({ active, onClick, count, dot, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        cursor: 'pointer',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--me-ink)' : 'var(--me-grey-70)',
        background: active ? '#fff' : 'transparent',
        boxShadow: active ? '0 0 0 1px var(--me-grey-15)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
      {/* The count is the whole point of the indicator: it answers "is there anything in
          there" without opening the tab. Neutral — a document having stamps is normal. */}
      {count != null ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>
          {count}
        </span>
      ) : null}
      {/* Hue only for what a human must resolve: a mark present but unreadable, or a
          presence answer that contradicts the marks listed under it. */}
      {dot ? (
        <span
          aria-label="needs a look"
          style={{ width: 5, height: 5, borderRadius: '50%', background: '#946400' }}
        />
      ) : null}
    </button>
  )
}

function FactRow({ fact, lit, onHover, onPick }) {
  const clickable = fact.page != null
  return (
    <div
      onMouseEnter={fact.anchorId ? () => onHover(fact.anchorId) : undefined}
      onMouseLeave={fact.anchorId ? () => onHover(null) : undefined}
      onClick={clickable ? () => onPick?.(fact) : undefined}
      style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--me-grey-08)',
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
    </div>
  )
}

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
