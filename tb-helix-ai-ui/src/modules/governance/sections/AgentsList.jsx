import PendingNotice from '../components/PendingNotice'
import IconButton from '@shared/ds/IconButton'
import { ellipsis } from '@shared/ds/text'
import Icon from '@shared/ds/Icon'
import { cardSurface } from '@shared/ds/Card'
import Button from '@shared/ds/Button'
import Badge from '@shared/ds/Badge'
import Page from '@shared/ds/Page'
import Toolbar from '@shared/ds/Toolbar'
import ViewSwitch from '@shared/ds/ViewSwitch'
import { listWrap, listHead } from '@shared/ds/listStyles'

// Domain agents — each with its own icon + accent so it reads like a distinct
// AI teammate. Cards (gallery) + List views; agents are deletable.
export default function AgentsList({ v }) {
  return (
    <Page width="detail">
      <Toolbar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'var(--me-grey-70)' }}>
            <span><strong style={{ color: 'var(--me-ink)' }}>{v.agents.length}</strong> agents</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--me-grey-20)' }} />
            <span><strong style={{ color: 'var(--me-ink)' }}>{v.libCount}</strong> checks in library</span>
          </div>
        }
        right={
          <>
            <PendingNotice pending={v.pending} />
            <Button variant="primary" size="md" onClick={v.newAgent} disabled={v.addBlocked}>New agent</Button>
            <ViewSwitch isList={v.isListMode} onList={v.setListMode} onCards={v.setGallery} />
          </>
        }
      />

      {v.isGallery && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {v.agents.map((a) => (
            <div key={a.id} role="button" tabIndex={0} onClick={a.onOpen} style={galleryCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
                <Avatar a={a} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--me-ink)', lineHeight: 1.25 }}>{a.name}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--me-grey)', marginTop: 5 }}>{a.summary}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Badge tone={a.statusTone}>{a.status}</Badge>
                  <IconButton icon="trash-2" size="md" tone="danger" title="Delete this agent" onClick={(e) => { e.stopPropagation(); a.onDelete() }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', borderTop: '1px solid var(--me-grey-08)', paddingTop: 11, minHeight: 20 }}>
                <span style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{a.cps} checks · {a.groups} groups</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {v.isListMode && (
        <div style={listWrap}>
          <div style={{ ...agentCols, ...listHead }}>
            <span>Agent</span><span>Domain</span><span>Status</span><span />
          </div>
          {v.agents.map((a) => (
            <div key={a.id} role="button" tabIndex={0} onClick={a.onOpen} style={{ ...agentCols, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--me-grey-08)', background: '#fff', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Avatar a={a} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--me-ink)', ...ellipsis }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--me-grey-70)', marginTop: 1 }}>{a.cps} checks · {a.groups} groups</div>
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--me-grey)' }}>{a.cat}</span>
              <span><Badge tone={a.statusTone}>{a.status}</Badge></span>
              <IconButton icon="trash-2" size="md" tone="danger" title="Delete this agent" onClick={(e) => { e.stopPropagation(); a.onDelete() }} />
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

// Agent avatar — its icon on a soft tint of its accent, so each agent is
// recognisable at a glance.
export function Avatar({ a, size = 44 }) {
  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: size * 0.28, background: a.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={a.icon || 'bot'} size={Math.round(size * 0.5)} color={a.accent || 'var(--me-grey)'} />
    </span>
  )
}

// Card's surface, given a button's behaviour — the whole tile is the target.
const galleryCard = { ...cardSurface(14), textAlign: 'left', padding: '18px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }
const agentCols = { display: 'grid', gridTemplateColumns: '1.9fr 1fr 0.9fr 28px', gap: 16 }
