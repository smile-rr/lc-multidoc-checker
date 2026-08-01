import Icon from '@shared/ds/Icon'

// Signatures, seals and corrections found on the document — reported apart from the
// fields because "a signature is present and we could not read it" is a different
// statement from "the document is unsigned", and only one of them is a discrepancy.
// A fact holds one value; a document carries several marks, so they never fitted the
// fact list.
//
// The list body only. FactsPanel supplies the card and the header, the same way it
// does for Fields and Layout.

const ICON = {
  signature: 'pen-line',
  seal: 'badge-check',
  stamp: 'stamp',
  handwriting: 'pen-tool',
  correction: 'pencil-line',
  tick: 'square-check',
  strikethrough: 'strikethrough',
  label: 'tag',
}

// The five presence answers, in the order an examiner asks them. Keyed by dictionary
// field so the strip follows the dictionary rather than restating it.
const PRESENCE = [
  { key: 'signed', label: 'Signed' },
  { key: 'seal_present', label: 'Seal' },
  { key: 'corrections_present', label: 'Corrections' },
  { key: 'original_marking', label: 'Original' },
  { key: 'endorsement_present', label: 'Endorsed' },
]

export default function MarksPanel({ marks, facts = [], attested, activePage, onPickPage }) {
  // Three states, not two. "Examined and found nothing" is a conclusion an officer can
  // act on; "never examined" means no attestation is bound to this document type. Both
  // used to render as an absent tab, which is why it read as a bug.
  if (!attested) {
    return (
      <Note>
        Not examined for signatures or stamps. No attestation is bound to this document
        type — add one in Governance to have it read on the next run.
      </Note>
    )
  }

  return (
    <>
      <PresenceStrip facts={facts} />
      {marks.length === 0 ? (
        <Note>Examined. No signatures, seals or corrections found on this document.</Note>
      ) : (
        marks.map((m, i) => (
          <MarkRow
            key={`${m.kind}-${m.page}-${i}`}
            mark={m}
            lit={m.page != null && activePage === m.page}
            onPick={onPickPage}
          />
        ))
      )}
    </>
  )
}

// Presence first, literally: the yes/no answers above the detail they summarise. Read
// from the facts rather than recomputed from the marks — the fact is what a rule joins
// on, so anything else here could disagree with the finding the officer is shown.
function PresenceStrip({ facts }) {
  const byKey = {}
  for (const f of facts) if (f.fieldKey) byKey[f.fieldKey] = f
  const shown = PRESENCE.map((p) => ({ ...p, fact: byKey[p.key] })).filter((p) => p.fact)
  if (!shown.length) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 14px',
        padding: '10px 14px',
        borderBottom: '1px solid var(--me-grey-15)',
        background: 'var(--me-grey-04, #fafafa)',
      }}
    >
      {shown.map((p) => (
        <span key={p.key} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{p.label}</span>
          <span
            title={p.fact.flag || undefined}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              // Amber only where the pass contradicted itself — the one case a human
              // has to resolve. A plain YES or NO is a reading, not a warning.
              color: p.fact.flag ? '#946400' : 'var(--me-ink)',
            }}
          >
            {answer(p.fact.value)}
            {p.fact.flag ? ' !' : ''}
          </span>
        </span>
      ))}
    </div>
  )
}

// 'none' is what an enum-valued presence field answers when there is nothing; shown as
// an em dash so the strip reads at a glance instead of being parsed.
function answer(value) {
  const v = String(value ?? '').trim()
  if (!v || /^(none|na|n\/a)$/i.test(v)) return '—'
  return v.toUpperCase() === 'YES' ? 'yes' : v.toUpperCase() === 'NO' ? 'no' : v
}

function Note({ children }) {
  return (
    <div style={{ padding: 14, fontSize: 12, color: 'var(--me-grey-70)', fontStyle: 'italic', lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function MarkRow({ mark, lit, onPick }) {
  const clickable = mark.page != null
  // Grey and italic, not amber. An unreadable mark is a fact about the scan, not a
  // finding — the examiner decides whether it matters, and colouring it here would
  // decide for them.
  const unread = !mark.legible || !mark.readsAs

  return (
    <div
      onClick={clickable ? () => onPick?.(mark.page) : undefined}
      style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--me-grey-08)',
        background: '#fff',
        boxShadow: lit ? 'inset 2px 0 0 var(--me-blue)' : 'none',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow 120ms var(--ease-standard)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, alignItems: 'baseline' }}>
        <span style={{ display: 'flex', alignSelf: 'start', marginTop: 2, color: 'var(--me-grey-50)' }}>
          <Icon name={ICON[mark.kind] || 'pen-line'} size={13} />
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
              color: unread ? 'var(--me-grey-70)' : 'var(--me-ink)',
              fontStyle: unread ? 'italic' : 'normal',
              wordBreak: 'break-word',
            }}
          >
            {unread ? 'present, not legible' : mark.readsAs}
          </span>

          {/* Capacity earns its own line. UCP 600 art. 20(a)(i) is not satisfied by a
              signature — it is satisfied by one stating what capacity it was given in,
              so this is the part an examiner is actually reading for. */}
          {mark.capacity ? (
            <span style={{ fontSize: 11.5, color: 'var(--me-ink)', lineHeight: 1.45 }}>{mark.capacity}</span>
          ) : null}

          {mark.authenticates ? (
            <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', lineHeight: 1.45 }}>
              authenticates {mark.authenticates}
            </span>
          ) : null}

          <span style={{ fontSize: 11, color: 'var(--me-grey-50)', lineHeight: 1.45 }}>
            {[mark.kind, mark.medium, mark.placement].filter(Boolean).join(' · ')}
          </span>
        </div>

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-50)', whiteSpace: 'nowrap' }}>
          {mark.page != null ? `p.${mark.page}` : ''}
        </span>
      </div>
    </div>
  )
}
