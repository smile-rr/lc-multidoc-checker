import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Switch from '@shared/ds/Switch'
import Select from '@shared/ds/Select'
import Checkbox from '@shared/ds/Checkbox'
import Page from '@shared/ds/Page'
import DetailBack from '@shared/ds/DetailBack'
import ViewSwitch from '@shared/ds/ViewSwitch'
import Eyebrow from '@shared/ds/Eyebrow'
import IconButton from '@shared/ds/IconButton'
import { cardSurface } from '@shared/ds/Card'
import { Menu, MenuItem, MenuHeader, MenuEmpty } from '@shared/ds/Menu'
import { Z } from '@shared/ds/z'
import Check from '../components/Check'
import AgentCheckRow from '../components/AgentCheckRow'
import { Avatar } from './AgentsList'

// Agent detail — a single agent panel with a back link on top; "Checks & groups"
// and "Scope & configuration" tabs. Checks inside groups show as list rows.
export default function AgentDetail({ v }) {
  return (
    <Page width="detail">
      <DetailBack label="Back to agents" onBack={v.goAgents} />

      <div style={agentPanel} data-review-card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={v.toggleAgentIconPicker} title="Change icon & colour" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', borderRadius: 12 }}>
            <Avatar a={{ icon: v.agentIcon, accent: v.agentAccent, accentSoft: v.agentAccentSoft }} size={42} />
          </button>
          {v.agentIconPickerOpen && <IconPicker v={v} />}
        </span>
        <input className="inline-edit" value={v.agentName} onChange={v.onRenameAgent} placeholder="Agent name" style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--me-ink)', padding: '4px 8px', marginLeft: -8 }} />
        <Switch label="Active" checked={v.agentActive} onChange={v.toggleAgent} />
        <Button variant="primary" size="md" onClick={v.openTest}>Test run</Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--me-grey-15)', marginBottom: 22 }}>
        <button onClick={v.tabCheckpoints} style={{ ...tabBtn, marginRight: 20, borderBottom: `2px solid ${v.cpTabBorder}`, fontWeight: v.cpTabWeight, color: v.cpTabColor }}>Checks</button>
        <button onClick={v.tabConfig} style={{ ...tabBtn, borderBottom: `2px solid ${v.cfgTabBorder}`, fontWeight: v.cfgTabWeight, color: v.cfgTabColor }}>Config</button>
        <div style={{ flex: 1 }} />
        {v.isCheckpointsTab && (
          <button onClick={v.openReviewAgent} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: v.notesBtnBg, border: `1px solid ${v.notesBtnBorder}`, borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: v.notesBtnColor, marginBottom: 6 }}>
            <Icon name="message-square" size={16} />Notes &amp; review
          </button>
        )}
      </div>

      {v.isCheckpointsTab && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--me-grey-70)' }}>
                {v.agentArrange ? 'Drag the handles to reorder groups and move checks between them.' : 'Open a check to edit it. Turn on Arrange to reorder.'}
              </span>
              <button onClick={v.toggleArrange} title="Reorder groups and move checks" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', border: `1px solid ${v.agentArrange ? 'var(--me-blue)' : 'var(--me-grey-20)'}`, borderRadius: 9, background: v.arrangeBg, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: v.arrangeFg }}>
                <Icon name="move" size={16} color="currentColor" />Arrange
              </button>
              <ViewSwitch isList={v.agentChecksIsList} onList={v.setAgentChecksList} onCards={v.setAgentChecksCards} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 16 }}>
              {v.groups.map((group) => (
                <div key={group.gid} data-review-card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {v.agentArrange && (
                      <span draggable onDragStart={group.onGroupDragStart} onDragEnd={group.onGroupDragEnd} title="Drag to reorder group" style={{ cursor: 'grab', color: 'var(--me-grey-50)', display: 'flex', flexShrink: 0 }}><Icon name="grip-vertical" size={16} /></span>
                    )}
                    <span style={seqBadge} title={`Group ${group.seq}`}>{group.seq}</span>
                    <input className="inline-edit" value={group.name} onChange={group.onRename} placeholder="Group name" style={groupNameInput} />
                    <span style={{ fontSize: 12, color: 'var(--me-grey-70)', flexShrink: 0 }}>{group.count}</span>
                    {v.agentArrange && (
                      <>
                        <IconButton icon="chevron-up" size="md" title="Move this group up" onClick={group.onMoveUp} disabled={!group.canMoveUp} />
                        <IconButton icon="chevron-down" size="md" title="Move this group down" onClick={group.onMoveDown} disabled={!group.canMoveDown} />
                      </>
                    )}
                    <Menu
                      open={group.addOpen}
                      onClose={group.onAdd}
                      align="right"
                      top={34}
                      width={300}
                      maxHeight={300}
                      trigger={<button onClick={group.onAdd} title="Add a check to this group" style={addCheckBtn}><Icon name="plus" size={15} />Add check</button>}
                    >
                      <MenuHeader>Add a check to this group</MenuHeader>
                      {group.addable.map((ac, i) => (
                        <MenuItem key={i} icon={ac.kindIcon} label={ac.title} hint={ac.domain} onClick={ac.onAdd} />
                      ))}
                      {group.noAddable && <MenuEmpty>Every check is already in this agent.</MenuEmpty>}
                    </Menu>
                    <IconButton icon="trash-2" size="md" tone="danger" title="Delete this group" onClick={group.onDelete} />
                  </div>
                  <div
                    onDragOver={group.onDragOver}
                    onDragEnter={group.onDragEnter}
                    onDrop={group.onDrop}
                    style={{ display: 'flex', flexDirection: 'column', gap: 12, border: `2px dashed ${group.dropBorder}`, background: group.dropBg, borderRadius: 12, padding: 8, minHeight: 64, transition: 'border-color .12s, background .12s' }}
                  >
                    {group.checks.map((check) =>
                      v.agentChecksIsCards ? <Check key={check.id} check={check} /> : <AgentCheckRow key={check.id} check={check} />
                    )}
                    {group.empty && <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--me-grey-50)', padding: 14 }}>Drop a check here, or add one with the + above</div>}
                  </div>
                </div>
              ))}
              <button onClick={v.addGroup} title="Add a group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '11px 0', background: 'none', border: '1px dashed var(--me-grey-20)', borderRadius: 12, cursor: 'pointer', fontSize: 13, color: 'var(--me-grey-70)', fontWeight: 600 }}><Icon name="plus" size={16} />Add a group</button>
            </div>
          </div>
        </div>
      )}

      {v.isConfigTab && <ConfigTab v={v} />}
      </div>
    </Page>
  )
}

// White "workspace" card elevated on the grey page; inside, the group drop-zones
// are grey insets so items read with depth — all neutral, no coloured tint.
const agentPanel = { ...cardSurface(16), padding: '18px 20px 22px' }

function IconPicker({ v }) {
  return (
    <div style={{ position: 'absolute', top: 52, left: 0, zIndex: Z.popover, width: 264, background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 12, boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: 12 }}>
      <Eyebrow size="sm">Colour</Eyebrow>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
        {v.agentAccentOptions.map((c) => (
          <button key={c} onClick={() => v.pickAgentAccent(c)} title={c} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: c === v.agentAccent ? '2px solid var(--me-ink)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--me-grey-20)', cursor: 'pointer', padding: 0 }} />
        ))}
      </div>
      <Eyebrow size="sm">Icon</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginTop: 8 }}>
        {v.agentIconOptions.map((name) => (
          <button key={name} onClick={() => v.pickAgentIcon(name)} title={name} style={{ height: 34, borderRadius: 8, border: name === v.agentIcon ? `1px solid ${v.agentAccent}` : '1px solid var(--me-grey-15)', background: name === v.agentIcon ? v.agentAccentSoft : '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: name === v.agentIcon ? v.agentAccent : 'var(--me-grey)' }}>
            <Icon name={name} size={17} color="currentColor" />
          </button>
        ))}
      </div>
    </div>
  )
}

function ConfigTab({ v }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <h3 style={cardH3}>Behaviour</h3>
        <p style={{ fontSize: 12.5, color: 'var(--me-grey-70)', margin: '0 0 12px' }}>What this agent does and how it reasons — the instructions it runs with.</p>
        <textarea value={v.agentBehavior} onChange={v.onChangeBehavior} placeholder="Describe how this agent should read its part of the presentation…" style={{ width: '100%', minHeight: 110, border: '1px solid var(--me-grey-20)', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--me-ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      <div style={card}>
        <h3 style={cardH3}>Execution strategy</h3>
        <p style={{ fontSize: 12.5, color: 'var(--me-grey-70)', margin: '0 0 16px' }}>How the agent calls its checks.</p>
        <div style={{ background: 'var(--me-grey-08)', borderRadius: 10, padding: '13px 15px', marginBottom: 16 }}>
          <Checkbox label="Read the whole presentation before scoring any check (holistic read)" checked={v.holistic} onChange={v.toggleHolistic} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 18, alignItems: 'start' }}>
          <Select label="Group order" options={v.orderOptions} value={v.order} onChange={v.setOrder} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--me-grey)' }}>Max checks per call</label>
            <input type="number" defaultValue={5} min={1} max={12} style={{ width: '100%', height: 46, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '0 14px', fontSize: 14, color: 'var(--me-ink)', outline: 'none' }} />
            <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>Bigger groups are split into batches automatically.</span>
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={cardH3}>Tool authorization</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {v.tools.map((t, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--me-grey)' }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: t.bg, border: `1.5px solid ${t.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, flexShrink: 0 }}>{t.mark}</span>
              <span>{t.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

const tabBtn = { padding: '11px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14.5 }
const addCheckBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, height: 28, padding: '0 11px', borderRadius: 8, border: '1px solid var(--me-grey-20)', background: '#fff', color: 'var(--me-grey)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }
const seqBadge = { flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: 'var(--me-grey-15)', color: 'var(--me-grey-70)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const groupNameInput = { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--me-ink)', padding: '3px 6px' }
const card = { ...cardSurface(14), padding: '20px 22px' }
const cardH3 = { fontSize: 15, fontWeight: 700, margin: '0 0 12px' }
