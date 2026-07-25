import { useState, useRef, useEffect } from 'react'
import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import { Z } from '@shared/ds/z'
import RuleEditor from './RuleEditor'

// A single editable check card. `check` is the view-model produced by
// store.buildCheck(). Faithful port of Check.dc.html.
export default function Check({ check }) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Syntax-help tooltip closes when you click outside it.
  const helpRef = useRef(null)
  useEffect(() => {
    if (!check.helpOpen) return
    const onDown = (e) => { if (helpRef.current && !helpRef.current.contains(e.target)) check.onToggleHelp() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.helpOpen])
  return (
    <div
      data-review-card
      style={{
        background: '#fff',
        border: `1px solid ${check.cardBorder}`,
        borderRadius: 14,
        boxShadow: '0 2px 8px rgba(27,28,30,.05)',
        opacity: check.rowOpacity,
        padding: '14px 18px',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {check.showDrag && (
          <span draggable={check.draggable} onDragStart={check.onDragStart} title="Drag to another group" style={{ color: 'var(--me-grey-50)', cursor: 'grab', display: 'flex' }}>
            <Icon name="grip-vertical" size={18} />
          </span>
        )}
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: check.sevColor, flexShrink: 0 }} />
        {/* The id leads. It is the reference quoted in a refusal advice and in the
            audit file, and unlike the title beside it, it never changes. */}
        <span
          title={check.timesUsed ? `Cited by ${check.timesUsed} case${check.timesUsed === 1 ? '' : 's'}` : 'Never run'}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--me-ink)', flexShrink: 0 }}
        >
          {check.id}
        </span>
        <input
          className="inline-edit"
          value={check.title}
          onChange={check.onChangeTitle}
          onFocus={check.onFocus}
          placeholder="Check title"
          style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600, color: 'var(--me-ink)', padding: '4px 6px' }}
        />
        {check.draft && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 999, padding: '2px 8px' }}>Draft</span>
        )}
        {check.inactive && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#946400', background: '#FBEFCF', borderRadius: 999, padding: '2px 8px' }}>Inactive</span>
        )}
        {check.showComment && (
          <button onClick={check.onComment} title="Comment & review" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--me-grey-15)', background: 'none', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', color: 'var(--me-grey-70)', fontSize: 11.5 }}>
            <Icon name="message-square" size={14} />
            {check.hasComments && <span>{check.commentCount}</span>}
          </button>
        )}
        {check.showToggle && (
          <button onClick={check.onToggleActive} title="Enable in this agent" style={{ width: 34, height: 20, borderRadius: 999, border: 'none', background: check.trackBg, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: check.knobLeft, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
          </button>
        )}
        {check.showExpand && (
          <button onClick={check.onToggleExpand} title="Expand" style={iconBtn}>
            <Icon name={check.expandIcon} size={18} color="var(--me-grey-50)" />
          </button>
        )}
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={() => setMenuOpen((o) => !o)} title="More actions" style={iconBtn}>
            <Icon name="ellipsis-vertical" size={18} color="var(--me-grey-50)" />
          </button>
          {menuOpen && (
            <div style={{ ...popover, top: 32, right: 0, width: 176 }}>
              <button onClick={() => { setMenuOpen(false); check.onToggleInactive() }} style={menuItem}>
                <Icon name={check.inactive ? 'circle-check' : 'circle-slash'} size={15} color="var(--me-grey-70)" />
                {check.inactive ? 'Restore' : 'Retire'}
              </button>
              <button
                onClick={() => { setMenuOpen(false); check.onDelete() }}
                title={check.deleteTip}
                style={{ ...menuItem, color: check.deletable ? 'var(--status-error)' : 'var(--me-grey-50)' }}
              >
                <Icon name="trash-2" size={15} color="currentColor" />
                Delete check
              </button>
            </div>
          )}
        </span>
      </div>

      {/* Severity + refs + assignment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 0' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)' }}>Severity</span>
          <select value={check.severity} onChange={check.onChangeSev} style={{ height: 28, border: '1px solid var(--me-grey-20)', borderRadius: 7, padding: '0 8px', fontSize: 12, fontWeight: 600, color: check.sevColor, background: '#fff', cursor: 'pointer', outline: 'none' }}>
            <option value="CRITICAL">Critical</option>
            <option value="MAJOR">Major</option>
            <option value="MINOR">Minor</option>
          </select>
        </span>
        <span style={{ width: 1, height: 18, background: 'var(--me-grey-15)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {check.refChips.map((rc) => (
            <span key={rc.code} title={rc.desc} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: 999, padding: '3px 5px 3px 9px' }}>
              {rc.code}
              <button onClick={rc.onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-blue-deep)', display: 'flex', padding: 0, opacity: 0.7 }}><Icon name="x" size={12} /></button>
            </span>
          ))}
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={check.onToggleRefs} style={dashChip}><Icon name="book-open" size={13} />Ref</button>
            {check.refsOpen && (
              <div style={{ ...popover, top: 30, left: 0, width: 320, maxHeight: 260, overflow: 'auto' }}>
                <div style={popHeader}>UCP 600 / ISBP 821 book</div>
                {check.refBook.map((rb) => (
                  <button key={rb.code} onClick={rb.onAdd} style={{ ...popItem, flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>{rb.code}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--me-grey)' }}>{rb.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {check.showAssign && (
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={check.onToggleAssign} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${check.assignBorder}`, background: check.assignBg, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: check.assignColor }}>
              <Icon name={check.assignIcon} size={14} />
              {check.assignLabel}
              <Icon name="chevron-down" size={13} />
            </button>
            {check.assignOpen && (
              <div style={{ ...popover, top: 32, right: 0, width: 260 }}>
                <div style={popHeader}>Put this check in one agent</div>
                {check.assignOptions.map((ao, i) => (
                  <button key={i} onClick={ao.onPick} style={{ ...popItem, gap: 8, background: ao.bg, color: ao.color }}>
                    <Icon name={ao.icon} size={14} />
                    {ao.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>

      {/* Fields */}
      <ChipRow
        label="Fields"
        chips={check.fieldChips.map((fc) => (
          <span key={fc.code} title={fc.name} style={chipStyle}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--me-blue-deep)' }}>{fc.code}</span>
            {fc.name}
            <button onClick={fc.onRemove} style={chipX}><Icon name="x" size={11} /></button>
          </span>
        ))}
        adder={
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={check.onToggleFields} style={{ ...dashChip, borderRadius: 6, padding: '2px 9px' }}>+ Field</button>
            {check.fieldsOpen && (
              <div style={{ ...popover, top: 28, left: 0, width: 284, maxHeight: 280, overflow: 'auto' }}>
                <button onClick={check.onDetectFields} style={{ ...popItem, gap: 7, background: 'var(--me-blue-20)', fontWeight: 600, color: 'var(--me-blue-deep)', marginBottom: 4 }}>
                  <Icon name="sparkles" size={14} />Detect fields from the note
                </button>
                {check.fieldBook.map((fb) => (
                  <button key={fb.code} onClick={fb.onAdd} style={{ ...popItem, gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>{fb.code}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--me-grey)' }}>{fb.name}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        }
      />

      {/* Documents */}
      <ChipRow
        label="Documents"
        chips={check.docChips.map((dc, i) => (
          <span key={i} style={chipStyle}>
            {dc.name}
            <button onClick={dc.onRemove} style={chipX}><Icon name="x" size={11} /></button>
          </span>
        ))}
        adder={
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={check.onToggleDocs} style={{ ...dashChip, borderRadius: 6, padding: '2px 9px' }}>+ Document</button>
            {check.docsOpen && (
              <div style={{ ...popover, top: 28, left: 0, width: 260, maxHeight: 280, overflow: 'auto' }}>
                {check.docBook.map((db, i) => (
                  <button key={i} onClick={db.onAdd} style={{ ...popItem, fontSize: 12.5, color: 'var(--me-ink)' }}>{db.name}</button>
                ))}
              </div>
            )}
          </span>
        }
      />

      {/* Body editor */}
      {check.showBody && (
        <>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <span ref={helpRef} style={{ position: 'absolute', top: 8, right: 8, zIndex: Z.popover }}>
              <button onClick={check.onToggleHelp} title="Syntax help" style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--me-grey-15)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--me-grey-70)', fontSize: 13, fontWeight: 700 }}>?</button>
              {check.helpOpen && (
                <div style={{ position: 'absolute', top: 30, right: 0, zIndex: Z.popover, width: 322, background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 10, boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
                    <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Writing a check</div>
                    <button onClick={check.onToggleHelp} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 2, marginRight: -2 }}><Icon name="x" size={15} /></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12, lineHeight: 1.5, color: 'var(--me-grey)' }}>
                    <div style={{ display: 'flex', gap: 9 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{'{41A}'}</span><span>Wrap an LC field code in braces to mark it for extraction — the name is recognised automatically.</span></div>
                    <div style={{ display: 'flex', gap: 9 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-blue-deep)', flexShrink: 0, paddingTop: 1 }}>UCP600 Art.6</span><span>References highlight on their own — or add them from the book.</span></div>
                    <div style={{ display: 'flex', gap: 9 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey)', flexShrink: 0, paddingTop: 1 }}>- …</span><span>Everything else is plain guidance; a dash line reads as one condition.</span></div>
                  </div>
                  <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--me-grey-70)', marginBottom: 7 }}>Logic words are optional — write freely; these just get highlighted so the reasoning reads clearly:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {['WHEN', 'IF', 'UNLESS', 'THEN', 'AND', 'OR', 'NOT', 'BEFORE', 'AFTER', 'WITHIN', 'AT LEAST'].map((k) => <span key={k} style={kwChipStruct}>{k}</span>)}
                      {['MUST', 'SHOULD', 'MAY'].map((k) => <span key={k} style={kwChipModal}>{k}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </span>
            <RuleEditor value={check.body} onChange={check.onChangeBody} onFocus={check.onFocus} fields={check.dictFields} />
          </div>
          {check.editing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div style={{ flex: 1 }} />
              <button onClick={check.onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--me-grey-70)', fontWeight: 600 }}>Cancel</button>
              <Button variant="primary" size="sm" onClick={check.onSave}>Save</Button>
            </div>
          )}
        </>
      )}

      {/* Compact preview */}
      {check.showPreview && (
        <div onClick={check.onToggleExpand} style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--me-grey-70)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{check.preview}</div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)', fontSize: 11.5, color: 'var(--me-grey-70)', flexWrap: 'wrap' }}>
        <span>{check.casesLabel}</span>
        {check.showInLine && (<><span>·</span><span>{check.inLabel}</span></>)}
        {check.hasComments && (<><span>·</span><span style={{ color: 'var(--me-blue)', fontWeight: 600 }}>{check.commentCount} comments</span></>)}
      </div>
    </div>
  )
}

function ChipRow({ label, chips, adder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginTop: label === 'Fields' ? 11 : 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)', paddingTop: 4, width: 64, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {chips}
        {adder}
      </div>
    </div>
  )
}

const iconBtn = { width: 30, height: 30, borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--me-grey-50)' }
const dashChip = { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px dashed var(--me-grey-20)', background: 'none', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 11.5, color: 'var(--me-grey-70)' }
const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--me-grey)', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 6, padding: '2px 6px 2px 8px' }
const chipX = { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 0 }
const popover = { position: 'absolute', zIndex: Z.popover, background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 10, boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: 6 }
const popHeader = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--me-grey-70)', padding: '6px 8px 4px' }
const menuItem = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--me-ink)' }
const kwChipStruct = { fontSize: 10.5, fontWeight: 600, color: 'var(--me-navy)', background: 'rgba(44,58,135,.10)', borderRadius: 4, padding: '2px 6px' }
const kwChipModal = { fontSize: 10.5, fontWeight: 700, color: '#946400', background: '#FBEFCF', borderRadius: 4, padding: '2px 6px' }
const popItem = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', padding: '8px 9px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }
