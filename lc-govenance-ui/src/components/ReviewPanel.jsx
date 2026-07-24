import Icon from '../ds/Icon'
import Button from '../ds/Button'

// Right-hand review drawer. `ctx` is store.reviewCtx. Draggable by its header
// and collapsible to just the header (props supplied by App).
export default function ReviewPanel({ ctx, collapsed, onToggleCollapse, onDragStart }) {
  if (!ctx) return null
  return (
    <aside style={{ width: '100%', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 14px 13px 18px', borderBottom: collapsed ? 'none' : '1px solid var(--me-grey-15)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div onMouseDown={onDragStart} title="Drag to move" style={{ flex: 1, minWidth: 0, cursor: 'grab', userSelect: 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{ctx.kindLabel}</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, lineHeight: 1.35 }}>{ctx.title}</div>
        </div>
        <button onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'} style={hdrBtn}><Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} /></button>
        <button onClick={ctx.onClose} title="Close" style={hdrBtn}><Icon name="x" size={18} /></button>
      </div>

      {collapsed ? null : (
      <>
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--me-grey-08)' }}>
        {ctx.context && (
          <div style={{ padding: '12px 18px', background: '#fff', borderBottom: '1px solid var(--me-grey-15)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-grey)' }}>{ctx.context}</div>
        )}

        <div style={{ padding: '14px 18px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <Icon name="sparkles" size={14} color="var(--me-navy)" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>Refine with the assistant</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ctx.chips.map((ch, i) => (
              <button key={i} onClick={ch.onPick} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', border: 'none', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>{ch.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 18px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)', marginBottom: 12 }}>Comments &amp; review</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ctx.comments.map((cm, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: cm.avatarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{cm.initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>{cm.author}</span>
                    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{cm.when}</span>
                    {cm.tag && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: cm.tagColor, background: cm.tagBg, borderRadius: 999, padding: '2px 7px' }}>{cm.tag}</span>}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--me-grey)', marginTop: 4, background: cm.bubbleBg, borderRadius: 8, padding: cm.bubblePad }}>{cm.text}</div>
                  {cm.canAdd && <button onClick={cm.onAdd} style={{ marginTop: 7, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--me-blue)' }}>+ Add this condition</button>}
                </div>
              </div>
            ))}
            {ctx.empty && <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', padding: '2px 0' }}>No comments yet. Leave a note, ask the assistant to refine it, or send it to a colleague.</div>}
          </div>
        </div>

        {ctx.hasHistory && (
          <div style={{ padding: '2px 18px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)', marginBottom: 12 }}>History</div>
            {ctx.timeline.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${ev.color}`, background: '#fff', marginTop: 2 }} />
                  <span style={{ width: 2, flex: 1, background: 'var(--me-grey-15)', minHeight: 12 }} />
                </div>
                <div style={{ paddingBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>{ev.label} <span style={{ fontWeight: 400, color: 'var(--me-grey-70)' }}>· {ev.date}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--me-grey)', lineHeight: 1.45, marginTop: 1 }}>{ev.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--me-grey-15)' }}>
        <textarea value={ctx.commentDraft} onChange={ctx.onDraft} placeholder="Add a comment…" style={{ width: '100%', border: '1px solid var(--me-grey-20)', borderRadius: 10, padding: '9px 11px', fontSize: 13, lineHeight: 1.5, color: 'var(--me-ink)', resize: 'none', minHeight: 52, outline: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
          <Button variant="primary" size="sm" onClick={ctx.onSendReview}>Send for review</Button>
          <Button variant="secondary" size="sm" onClick={ctx.onSendAdjust}>Request adjustment</Button>
        </div>
      </div>
      </>
      )}
    </aside>
  )
}

const hdrBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', color: 'var(--me-grey-70)', flexShrink: 0 }
