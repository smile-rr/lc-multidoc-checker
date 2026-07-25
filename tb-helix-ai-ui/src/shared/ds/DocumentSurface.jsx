import Icon from './Icon'
import { usePersistedState } from '../lib/usePersistedState'

// The frame every document is read inside.
//
// The credit is text and the presentation is a scan, so they render through
// different components — but they must not *look* like different products. This
// gives both the same chrome, the same page width and the same viewport height,
// wherever they appear.
//
// Height fills to the bottom of the window rather than being content-driven: a
// 4-line certificate and a 40-line credit should occupy the same space, and
// leaving dead air under a document viewer wastes the one thing a reading screen
// needs. `--case-header-h` is published by the case workbench.
//
// Page width is not set here — both viewers measure their own pane through
// `viewerChrome.useFitWidth`, so a page is as wide as the space it was given.
export const DOC_VIEWPORT_HEIGHT = 'calc(100vh - var(--case-header-h, 240px) - 44px)'

/**
 * One preference, every viewer.
 *
 * Hiding the page bar removes the whole row, not the numbers inside it — the
 * point is to reclaim the vertical space and leave the text and scan viewers
 * pixel-aligned. It is a workspace preference rather than a per-screen one, so
 * every viewer in the app reads the same key: an officer who does not want that
 * bar does not want it in Intake either.
 */
export function usePageBar() {
  const [visible, setVisible] = usePersistedState('viewer.pageBar', true)
  return { pageBarVisible: visible, togglePageBar: () => setVisible((v) => !v) }
}

export default function DocumentSurface({
  header,
  toolbar,
  notice,
  height = DOC_VIEWPORT_HEIGHT,
  pageBarVisible = true,
  onTogglePageBar,
  children,
}) {
  const showToolbar = !!toolbar && pageBarVisible

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--me-grey-15)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height,
        minHeight: 0,
      }}
    >
      {header ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            borderBottom: '1px solid var(--me-grey-15)',
            background: 'var(--me-grey-08)',
            flexShrink: 0,
            minHeight: 41,
          }}
        >
          {header}
          {/* The control lives here because the bar it governs can be gone, and
              something permanent has to be able to bring it back. */}
          {toolbar && onTogglePageBar ? (
            <button
              onClick={onTogglePageBar}
              aria-pressed={pageBarVisible}
              title={pageBarVisible ? 'Hide the page bar — remembered across the app' : 'Show the page bar'}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                height: 24,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--me-grey-20)',
                background: pageBarVisible ? '#fff' : 'var(--me-blue-20)',
                cursor: 'pointer',
                fontSize: 11,
                color: pageBarVisible ? 'var(--me-grey)' : 'var(--me-blue-deep)',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={pageBarVisible ? 'panel-top-close' : 'panel-top-open'} size={13} />
              Pages
            </button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--me-grey-15)', background: '#FBEFCF', fontSize: 12, color: '#946400', lineHeight: 1.5, flexShrink: 0 }}>
          {notice}
        </div>
      ) : null}

      {showToolbar ? <div style={{ flexShrink: 0 }}>{toolbar}</div> : null}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--me-grey-08)' }}>{children}</div>
    </div>
  )
}
