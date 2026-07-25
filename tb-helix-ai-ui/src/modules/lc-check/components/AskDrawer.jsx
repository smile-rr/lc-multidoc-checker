import { useState } from 'react'
import Drawer from '@shared/ds/Drawer'
import { ASK_SUGGESTIONS } from '../data/fixtures.js'

// Contextual assistant. Scoped to one case on purpose — it answers from this
// presentation and the rule books behind the checks, and says so when it can't.
export default function AskDrawer({ open, onClose, context, thread, onAsk }) {
  const [draft, setDraft] = useState('')

  const send = (text) => {
    const q = text.trim()
    if (!q) return
    onAsk(q)
    setDraft('')
  }

  return (
    <Drawer open={open} onClose={onClose} title="Assistant" subtitle={context} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {thread.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.who === 'officer' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '86%',
                  padding: '10px 13px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.55,
                  background: m.who === 'officer' ? 'var(--me-blue)' : 'var(--me-grey-08)',
                  color: m.who === 'officer' ? '#fff' : 'var(--me-ink)',
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {ASK_SUGGESTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => send(s.label)}
                style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--me-grey-20)', fontSize: 12, color: 'var(--me-grey)', cursor: 'pointer', background: '#fff' }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(draft) }}
            placeholder="Ask anything about this presentation…"
            style={{ width: '100%', border: '1px solid var(--me-grey-20)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--me-ink)', outline: 'none' }}
          />
        </div>
      </div>
    </Drawer>
  )
}
