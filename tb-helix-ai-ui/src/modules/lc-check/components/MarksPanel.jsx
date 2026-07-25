import Icon from '@shared/ds/Icon'
import { toneOf } from '@shared/lib/tone'

const ICON = { signature: 'pen-line', stamp: 'stamp', handwriting: 'pen-tool' }

// Signatures, stamps and handwriting found on the document — reported separately
// because "a signature is present but we could not read it" is a different
// statement from "the document is unsigned", and only one of them is a finding.
export default function MarksPanel({ marks }) {
  if (!marks.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--me-grey-15)', fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>
        Signatures &amp; Stamps
      </div>
      {marks.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 14px', borderBottom: '1px solid var(--me-grey-08)' }}>
          <span style={{ display: 'flex', marginTop: 1 }}>
            <Icon name={ICON[m.kind] || 'pen-line'} size={14} color={toneOf(m.confidence).accent} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 12.5, color: 'var(--me-ink)', lineHeight: 1.45 }}>{m.text}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{m.source}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
