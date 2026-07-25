import { pageRange } from '@shared/lib/format'

// The document rail: the credit at the top, then whatever intake carved out of
// the bundle. Rows appear as segmentation finds them, with skeletons standing in
// for the rest — the officer sees the work happening rather than a spinner.
//
// Typography does the work of separating the two facts in a row. The document
// type is what the officer navigates by, so it is sans, near-black and slightly
// heavier; the reference and page range are supporting detail, so they are
// monospace, smaller and grey. Before, both were near enough the same size that
// the type disappeared into its own metadata.
export default function DocRail({ documents, selectedId, onSelect, segmented, segmentTotal, segmentNote }) {
  const credit = documents.filter((d) => d.role === 'credit')
  const presented = documents.filter((d) => d.role === 'presented')
  const found = presented.slice(0, segmented)
  const pending = Math.max(0, segmentTotal - segmented)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, overflow: 'hidden' }}>
      <Group label="Letter of Credit" count={`${credit.length}`}>
        {credit.map((d) => (
          <Row key={d.id} doc={d} sub={`MT700 · ${d.reference}`} on={d.id === selectedId} onClick={() => onSelect(d.id)} />
        ))}
      </Group>

      <Group label="Presented Documents" count={`${segmented} of ${segmentTotal}`}>
        {found.map((d) => (
          <Row
            key={d.id}
            doc={d}
            sub={`${pageRange(d.pageRange)} · ${d.reference}`}
            on={d.id === selectedId}
            onClick={() => onSelect(d.id)}
          />
        ))}
      </Group>

      {pending > 0 ? (
        <div style={{ padding: 12 }}>
          {[72, 60, 78, 54, 68, 62].slice(0, Math.min(6, pending)).map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0' }}>
              <div style={{ width: 26, height: 34, borderRadius: 3, background: 'var(--me-grey-08)' }} />
              <div style={{ height: 8, borderRadius: 3, background: 'var(--me-grey-15)', width: `${w}%` }} />
            </div>
          ))}
          <div style={{ paddingTop: 8, fontSize: 11.5, color: 'var(--me-grey-70)', lineHeight: 1.45 }}>{segmentNote}</div>
        </div>
      ) : null}
    </div>
  )
}

function Group({ label, count, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Row({ doc, sub, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        width: '100%',
        padding: '10px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        border: 'none',
        borderLeft: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
        borderBottom: '1px solid var(--me-grey-08)',
        background: on ? 'var(--me-blue-20)' : '#fff',
      }}
    >
      <div
        style={{
          width: 26,
          height: 34,
          flex: '0 0 26px',
          borderRadius: 3,
          border: `1px solid ${on ? 'var(--me-blue-50)' : 'var(--me-grey-20)'}`,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: on ? 'var(--me-blue-deep)' : 'var(--me-grey-70)',
        }}
      >
        {doc.abbr}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        {/* What you navigate by: sans, near-black, a touch heavier. */}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            color: on ? 'var(--me-blue-deep)' : 'var(--me-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.docType}
        </span>
        {/* Supporting detail: mono, smaller, grey. */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.3,
            color: 'var(--me-grey-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </span>
      </div>

      {doc.lowConfidence ? (
        <span
          title="Part of this document was hard to read"
          style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-warning)', flex: '0 0 6px' }}
        />
      ) : null}
    </button>
  )
}
