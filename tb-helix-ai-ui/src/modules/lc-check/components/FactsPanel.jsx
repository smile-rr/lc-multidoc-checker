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

const OFF_DICT = 'Not in the dictionary'

const isOffDictionary = (f) => f.flag === OFF_DICT

// What the reading produced — four views for presented documents, one for the credit:
//
//   Fields   structured values (the working view)
//   Marks    signatures, seals and corrections — read from the page, not from its text
//   Layout   full-page markdown (fallback when a named field was thin)
//   Source   the fields as JSON (what the model returned, not a second prose dump)
//
// Fields are grouped by page (PDF reading order), and within a page: dictionary
// bindings first, then "Also on this page" for keys the dictionary does not yet
// cover — one section label instead of the same flag on every row.
//
// Confidence is quiet by default. Only LOW earns a chip; MED was written as a
// placeholder and looked like real uncertainty on every row.
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
  const lowCount = facts.filter((f) => f.confidence === 'LOW').length
  const offCount = facts.filter(isOffDictionary).length
  const unread = marks.filter((m) => !m.legible || !m.readsAs).length
  // What an officer must resolve by hand: a mark that is there and cannot be read, or a
  // presence answer that contradicts the marks listed beside it. Nothing else earns hue.
  const needsEye = unread > 0 || facts.some((f) => f.fieldKey && f.flag && PRESENCE_KEYS.has(f.fieldKey))

  const pages = useMemo(() => groupByPage(facts, isCredit), [facts, isCredit])

  const sourceJson = useMemo(() => {
    const rows = facts.map((f) => {
      const row = { label: f.label, value: f.value ?? '' }
      if (f.fieldKey) row.key = f.fieldKey
      if (f.confidence === 'LOW') row.confidence = f.confidence
      if (f.page != null) row.page = f.page
      if (isOffDictionary(f)) row.offDictionary = true
      else if (f.flag) row.flag = f.flag
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
        : [
            `${facts.length} fields`,
            offCount ? `${offCount} not in dictionary` : null,
            lowCount ? `${lowCount} low confidence` : null,
          ].filter(Boolean).join(' · ')

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
          pages.map((g) => (
            <PageGroup
              key={g.page == null ? 'none' : g.page}
              group={g}
              showPage={!isCredit && g.page != null}
              otherTitle={isCredit ? 'Also reported' : 'Also on this page'}
              otherNote={isCredit
                ? 'Not in the dictionary — kept as evidence'
                : 'Not in the dictionary — kept as evidence'}
              activePage={activePage}
              hoverAnchor={hoverAnchor}
              onHover={onHoverAnchor}
              onPickFact={onPickFact}
              onPickPage={onPickPage}
            />
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Page-first, then dictionary vs open-world extras.
 *
 * The credit has no bundle page — one group, still split known / other so an
 * off-schema SWIFT tag is not mixed into the bound terms without a label.
 */
function groupByPage(facts, isCredit) {
  if (isCredit) {
    return [{
      page: null,
      known: facts.filter((f) => !isOffDictionary(f)),
      other: facts.filter(isOffDictionary),
    }]
  }

  const order = []
  const byPage = new Map()
  for (const f of facts) {
    const key = f.page == null ? '∅' : f.page
    if (!byPage.has(key)) {
      byPage.set(key, { page: f.page ?? null, known: [], other: [] })
      order.push(key)
    }
    const g = byPage.get(key)
    if (isOffDictionary(f)) g.other.push(f)
    else g.known.push(f)
  }
  order.sort((a, b) => {
    if (a === '∅') return 1
    if (b === '∅') return -1
    return Number(a) - Number(b)
  })
  return order.map((k) => byPage.get(k))
}

function PageGroup({ group, showPage, otherTitle, otherNote, activePage, hoverAnchor, onHover, onPickFact, onPickPage }) {
  const onPage = showPage && group.page != null && activePage === group.page
  return (
    <div>
      {showPage ? (
        <button
          type="button"
          onClick={() => onPickPage?.(group.page)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 14px',
            border: 'none',
            borderBottom: '1px solid var(--me-grey-15)',
            background: onPage ? 'var(--me-blue-20)' : 'var(--me-grey-08)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: onPage ? 'var(--me-blue-deep)' : 'var(--me-grey)',
          }}
          >
            p.{group.page}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>
            {group.known.length + group.other.length}
          </span>
        </button>
      ) : null}

      {group.known.map((f) => (
        <FactRow
          key={`${f.docId}-${f.anchorId ?? f.page}-${f.label}-k`}
          fact={f}
          lit={(f.anchorId && hoverAnchor === f.anchorId) || (f.page != null && activePage === f.page)}
          onHover={onHover}
          onPick={onPickFact}
        />
      ))}

      {group.other.length > 0 ? (
        <>
          <SectionLabel
            title={otherTitle}
            note={otherNote}
            count={group.other.length}
          />
          {group.other.map((f) => (
            <FactRow
              key={`${f.docId}-${f.anchorId ?? f.page}-${f.label}-o`}
              fact={f}
              lit={(f.anchorId && hoverAnchor === f.anchorId) || (f.page != null && activePage === f.page)}
              onHover={onHover}
              onPick={onPickFact}
              muteFlag
            />
          ))}
        </>
      ) : null}
    </div>
  )
}

function SectionLabel({ title, note, count }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      padding: '8px 14px 4px',
      background: '#fff',
    }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#946400' }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--me-grey-70)', marginTop: 1 }}>{note}</div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>{count}</span>
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
      {count != null ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)' }}>
          {count}
        </span>
      ) : null}
      {dot ? (
        <span
          aria-label="needs a look"
          style={{ width: 5, height: 5, borderRadius: '50%', background: '#946400' }}
        />
      ) : null}
    </button>
  )
}

function FactRow({ fact, lit, onHover, onPick, muteFlag }) {
  const clickable = fact.page != null || fact.anchorId
  // Off-dictionary rows sit under a section label; other flags (e.g. attest
  // contradictions) still belong on the row.
  const flag = muteFlag || fact.flag === OFF_DICT ? null : fact.flag
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
        <ConfChip conf={fact.confidence} />
      </div>

      {flag ? (
        <div style={{ marginTop: 4, marginLeft: 142, fontSize: 11.5, color: '#946400', lineHeight: 1.45 }}>{flag}</div>
      ) : null}
    </div>
  )
}

/** Only LOW. MED was a write-time placeholder and equalled noise on every row. */
function ConfChip({ conf }) {
  if (conf !== 'LOW') return null
  return (
    <span
      title="Low confidence — check the original"
      style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        padding: '1px 4px',
        borderRadius: 3,
        color: '#cc0011',
        background: '#fff1f0',
        whiteSpace: 'nowrap',
      }}
    >
      LOW
    </span>
  )
}
