import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import Spinner from '@shared/ds/Spinner'
import { pageList } from '@shared/lib/format'

// The document rail: the credit at the top, then whatever intake carved out of
// the bundle. Rows appear as segmentation finds them, with skeletons standing in
// for the rest — the officer sees the work happening rather than a spinner.
//
// During extract, each presented row shows a trailing mark: spinner while that
// document is being read, check when it is done.
export default function DocRail({
  documents,
  selectedId,
  onSelect,
  segmented,
  segmentTotal,
  segmentNote,
  docExtract = {},
}) {
  const credit = documents.filter((d) => d.role === 'credit')
  // Unidentified last — leftovers after the documents the officer can work.
  // Backend ordinal usually already does this; sorting here covers older cases.
  const presented = documents
    .filter((d) => d.role === 'presented')
    .slice()
    .sort((a, b) => Number(a.id === 'UNKNOWN') - Number(b.id === 'UNKNOWN'))

  // Once documents have landed, list them all and drive progress from extract
  // status. The page-count slice was a stand-in before the rail knew about
  // extract; keeping it only for the empty-rail skeleton phase.
  const listed = presented.length > 0 ? presented : presented.slice(0, segmented)
  const pending = presented.length > 0 ? 0 : Math.max(0, segmentTotal - segmented)
  const doneCount = listed.filter((d) => docExtract[d.id] === 'done').length
  const extracting = listed.some((d) => docExtract[d.id] === 'working')
  const presentedCount = extracting || doneCount
    ? `${doneCount} of ${listed.length} read`
    : presented.length > 0
      ? `${listed.length}`
      : `${segmented} of ${segmentTotal}`

  return (
    <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden' }}>
      <Group label="Letter of Credit" count={`${credit.length}`}>
        {credit.map((d) => (
          <Row key={d.id} doc={d} sub={`MT700 · ${d.reference}`} on={d.id === selectedId} onClick={() => onSelect(d.id)} />
        ))}
      </Group>

      <Group label="Presented Documents" count={presentedCount}>
        {listed.map((d) => {
          const pages = pageList(d.pages, d.pageRange)
          const sub = d.reference ? `${pages.text} · ${d.reference}` : pages.text
          return (
            <Row
              key={d.id}
              doc={d}
              sub={sub}
              subTitle={pages.title}
              on={d.id === selectedId}
              onClick={() => onSelect(d.id)}
              extract={docExtract[d.id]}
            />
          )
        })}
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
        <Eyebrow size="sm">{label}</Eyebrow>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Row({ doc, sub, subTitle, on, onClick, extract }) {
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
        <span
          title={subTitle || undefined}
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

      <ExtractMark status={extract} />

      {doc.lowConfidence && !extract ? (
        <span
          title="Part of this document was hard to read"
          style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-warning)', flex: '0 0 6px' }}
        />
      ) : null}
    </button>
  )
}

function ExtractMark({ status }) {
  if (!status) return null
  if (status === 'working') {
    return (
      <span title="Reading…" style={{ display: 'inline-flex', flexShrink: 0 }}>
        <Spinner size={12} />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span title="Extracted" style={{ display: 'inline-flex', flexShrink: 0 }}>
        <Icon name="check" size={14} color="var(--status-success, #1F7A00)" />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span title="Could not read" style={{ display: 'inline-flex', flexShrink: 0 }}>
        <Icon name="triangle-alert" size={13} color="var(--status-error, #B3261E)" />
      </span>
    )
  }
  return null
}
