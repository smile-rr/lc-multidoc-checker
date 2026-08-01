import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import IconButton from '@shared/ds/IconButton'
import { Z } from '@shared/ds/z'
import { TONE } from '@shared/lib/tone'

// Offline catalogue fallback — fixed bottom-right, dismissible.
//
// Lives outside the page flow so a failed load never shoves the tabs or content
// down. Soft wording only: HTTP status belongs in the console, not on an authoring
// surface.
export default function CatalogNotice({ detail }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const tone = TONE.warning
  return (
    <div
      role="status"
      title={detail || undefined}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: Z.drawer,
        maxWidth: 320,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 10px 12px 14px',
        borderRadius: 12,
        border: `1px solid ${tone.border}`,
        background: '#fff',
        boxShadow: '0 8px 28px rgba(27,28,30,.14)',
        animation: 'helix-in 200ms var(--ease-standard)',
      }}
    >
      <Icon name="circle-alert" size={15} color={tone.accent} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: tone.text }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Couldn't reach the catalogue</div>
        <div style={{ color: 'var(--me-grey-70)', fontWeight: 400 }}>
          Showing a local copy. Changes won't be saved.
        </div>
      </div>
      <IconButton
        icon="x"
        size="sm"
        title="Dismiss"
        onClick={() => setDismissed(true)}
        color="var(--me-grey-50)"
      />
    </div>
  )
}
