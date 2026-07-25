import Icon from './Icon'

/**
 * Page control for a bundle.
 *
 * Shows the pages of the document being read — a packing list on bundle pages
 * 3–4 offers 3 and 4, not all twelve. The whole bundle is still reachable via
 * prev/next, which step past the document's own range, because a segmentation
 * boundary is exactly the thing an officer needs to check.
 *
 * Targets are 30px so they can be hit without aiming.
 *
 * Whether this bar appears at all is a workspace preference owned by
 * DocumentSurface — hiding it removes the whole row so the viewer aligns with the
 * text viewer, which has no bar.
 */
export default function PageStrip({ pages, activePage, onPage, docPages, docLabel }) {
  const own = docPages?.length ? [...docPages].sort((a, b) => a - b) : null
  const list = own ?? Array.from({ length: pages }, (_, i) => i + 1)

  const canPrev = activePage > 1
  const canNext = activePage < pages
  const outsideDoc = !!own && !own.includes(activePage)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--me-grey-15)',
        background: '#fff',
        flexShrink: 0,
      }}
    >
      <Step icon="chevron-left" label="Previous page" enabled={canPrev} onClick={() => onPage(activePage - 1)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', flex: 1, minWidth: 0 }}>
        {own && own[0] > 1 ? <Ellipsis /> : null}
        {list.map((n) => {
          const on = n === activePage
          return (
            <button
              key={n}
              onClick={() => onPage(n)}
              title={`Page ${n}`}
              style={{
                minWidth: 30,
                height: 30,
                padding: '0 8px',
                borderRadius: 7,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: on ? 700 : 500,
                border: `1px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-20)'}`,
                background: on ? 'var(--me-blue)' : '#fff',
                color: on ? '#fff' : 'var(--me-grey)',
                flexShrink: 0,
              }}
            >
              {n}
            </button>
          )
        })}
        {own && own[own.length - 1] < pages ? <Ellipsis /> : null}

        {outsideDoc ? (
          <span style={{ marginLeft: 6, fontSize: 11.5, color: '#946400', whiteSpace: 'nowrap' }}>
            page {activePage} — outside {docLabel || 'this document'}
          </span>
        ) : null}
      </div>

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
        {activePage} / {pages}
      </span>

      <Step icon="chevron-right" label="Next page" enabled={canNext} onClick={() => onPage(activePage + 1)} />
    </div>
  )
}

function Ellipsis() {
  return <span style={{ padding: '0 2px', fontSize: 12, color: 'var(--me-grey-50)', flexShrink: 0 }}>…</span>
}

function Step({ icon, label, enabled, onClick }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={label}
      aria-label={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: '1px solid var(--me-grey-20)',
        background: '#fff',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={16} color="var(--me-grey)" />
    </button>
  )
}
