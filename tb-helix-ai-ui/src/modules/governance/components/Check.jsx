import { ellipsis } from '@shared/ds/text'
import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Select from '@shared/ds/Select'
import Chip from '@shared/ds/Chip'
import IconButton from '@shared/ds/IconButton'
import { Menu, MenuItem, MenuHeader, MenuEmpty } from '@shared/ds/Menu'
import { useNewItemFocus } from '@shared/lib/useNewItemFocus'
import ExactBody from './ExactBody'
import JudgedBody from './JudgedBody'

// The check card shell. Everything a check has whatever kind it is — id, title,
// severity, references, which agent it sits in — lives here; the middle of the
// card is filled by one of the two card bodies:
//
//   Rule card         rows comparing a field on one document with a field on
//                     another, run deterministically
//   Judged rule       requirements in plain language, read out of a clause of
//                     the credit or as standing practice
//
// `check` is the view-model produced by store.buildCheck().
export default function Check({ check }) {
  const [menuOpen, setMenuOpen] = useState(false)
  // A card you just created takes the caret and brings itself into view, so
  // adding one never means hunting for where it landed.
  const titleRef = useNewItemFocus(check.isNew)
  return (
    <div
      data-review-card
      data-item-id={check.id}
      style={{
        background: '#fff',
        border: `1px solid ${check.isNew ? 'var(--me-blue)' : check.cardBorder}`,
        borderRadius: 14,
        boxShadow: check.isNew ? '0 0 0 3px rgba(4,115,234,.10)' : '0 2px 8px rgba(27,28,30,.05)',
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
        <TypeBadge check={check} />
        <GateBadge check={check} />
        <input
          ref={titleRef}
          className="inline-edit"
          value={check.title}
          onChange={check.onChangeTitle}
          onFocus={check.onFocus}
          placeholder="Check title"
          style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600, color: 'var(--me-ink)', padding: '4px 6px' }}
        />
        {check.draft && <Chip size="sm" style={statePill}>Draft</Chip>}
        {check.inactive && <Chip size="sm" tone="warning" style={statePill}>Inactive</Chip>}
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
          <IconButton icon={check.expandIcon} size="lg" title="Expand" onClick={check.onToggleExpand} />
        )}
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          align="right"
          top={32}
          width={180}
          trigger={
            <IconButton icon="ellipsis-vertical" size="lg" title="More actions" onClick={() => setMenuOpen((o) => !o)} />
          }
        >
          <MenuItem
            icon={check.inactive ? 'circle-check' : 'circle-slash'}
            label={check.inactive ? 'Restore' : 'Retire'}
            onClick={() => { setMenuOpen(false); check.onToggleInactive() }}
          />
          <MenuItem
            icon="trash-2"
            label="Delete check"
            tone={check.deletable ? 'danger' : undefined}
            title={check.deleteTip}
            onClick={() => { setMenuOpen(false); check.onDelete() }}
          />
        </Menu>
      </div>

      {/* Severity + refs + assignment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 0' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)' }}>Severity</span>
          <Select size="sm" value={check.severity} onChange={check.onChangeSev} color={check.sevColor} options={SEVERITIES} style={{ padding: '0 8px', borderRadius: 7 }} />
        </span>
        <span style={{ width: 1, height: 18, background: 'var(--me-grey-15)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {check.refChips.map((rc) => (
            <Chip key={rc.code} tone="blue" size="sm" mono title={rc.desc} onRemove={rc.onRemove}>{rc.code}</Chip>
          ))}
          <Menu
            open={check.refsOpen}
            onClose={check.onToggleRefs}
            width={320}
            maxHeight={260}
            trigger={<Chip dashed size="sm" onClick={check.onToggleRefs}><Icon name="book-open" size={13} />Ref</Chip>}
          >
            <MenuHeader>UCP 600 / ISBP 821 book</MenuHeader>
            {check.refBook.map((rb) => <MenuItem key={rb.code} mono label={rb.code} hint={rb.desc} onClick={rb.onAdd} />)}
            {!check.refBook.length && <MenuEmpty>Every article in the book is already cited here.</MenuEmpty>}
          </Menu>
        </div>
        <div style={{ flex: 1 }} />
        {check.showAssign && (
          <Menu
            open={check.assignOpen}
            onClose={check.onToggleAssign}
            align="right"
            top={32}
            width={260}
            trigger={
              <button onClick={check.onToggleAssign} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${check.assignBorder}`, background: check.assignBg, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: check.assignColor }}>
                <Icon name={check.assignIcon} size={14} />
                {check.assignLabel}
                <Icon name="chevron-down" size={13} />
              </button>
            }
          >
            <MenuHeader>Put this check in one agent</MenuHeader>
            {check.assignOptions.map((ao, i) => (
              <MenuItem key={i} icon={ao.icon} label={ao.label} tone={ao.tone} selected={ao.selected} onClick={ao.onPick} />
            ))}
          </Menu>
        )}
      </div>

      {/* ---- Rule card ---- */}
      {check.isExact && <ExactBody check={check} />}

      {/* ---- Judged rule: which fields and documents it reads ----
          A rule states its operands in its own rows, so these chips belong to
          judged rules only. */}
      {check.showFieldRows && (
        <>
          <ChipRow
            label="Fields"
            chips={check.fieldChips.map((fc) => (
              <Chip key={fc.name} pill={false} title={`Read from: ${fc.docHint}`} onRemove={fc.onRemove}>
                <span style={{ fontWeight: 600, color: 'var(--me-blue-deep)' }}>{fc.name}</span>
                <span style={{ color: 'var(--me-grey-70)' }}>{fc.docHint}</span>
              </Chip>
            ))}
            adder={
              <Menu
                open={check.fieldsOpen}
                onClose={check.onToggleFields}
                top={28}
                width={300}
                trigger={<Chip dashed pill={false} onClick={check.onToggleFields}>+ Field</Chip>}
              >
                <MenuItem icon="sparkles" label="Detect fields from the text" onClick={check.onDetectFields} selected />
                <MenuHeader>Dictionary</MenuHeader>
                {check.fieldBook.map((fb) => <MenuItem key={fb.name} label={fb.name} hint={fb.docs} onClick={fb.onAdd} />)}
                {!check.fieldBook.length && <MenuEmpty>Every field in the dictionary is already listed here.</MenuEmpty>}
              </Menu>
            }
          />

          <ChipRow
            label="Documents"
            chips={check.docChips.map((dc, i) => (
              <Chip key={i} pill={false} onRemove={dc.onRemove}>{dc.name}</Chip>
            ))}
            adder={
              <Menu
                open={check.docsOpen}
                onClose={check.onToggleDocs}
                top={28}
                width={260}
                trigger={<Chip dashed pill={false} onClick={check.onToggleDocs}>+ Document</Chip>}
              >
                {check.docBook.map((db, i) => <MenuItem key={i} label={db.name} onClick={db.onAdd} />)}
                {!check.docBook.length && <MenuEmpty>Every document type is already listed here.</MenuEmpty>}
              </Menu>
            }
          />
        </>
      )}

      {check.showBody && <JudgedBody check={check} />}

      {check.editing && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 10 }}>
          {/* What is still missing, next to the button it is holding back —
              never a disabled control with no reason given. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {check.issues.map((t, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#946400' }}>
                <Icon name="circle-alert" size={13} color="currentColor" />{t}
              </span>
            ))}
          </div>
          <button onClick={check.onCancel} title={check.isNew ? 'Discard this new card — it has not been created yet' : 'Undo the changes made since you started editing'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: check.isNew ? 'var(--status-error)' : 'var(--me-grey-70)', fontWeight: 600, paddingBottom: 8 }}>{check.cancelLabel}</button>
          <Button variant="primary" size="sm" onClick={check.onSave} disabled={!check.canSave}>Save</Button>
        </div>
      )}

      {/* Compact preview */}
      {check.showPreview && (
        <div onClick={check.onToggleExpand} style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--me-grey-70)', cursor: 'pointer', ...ellipsis }}>{check.preview}</div>
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

// Which of the two kinds this card is — the first thing to read on it, because
// it says whether a model is in the loop at all.
// A hard check is visible without opening the body, because "this one can end the
// examination on its own" is not a detail — it changes how the whole plan reads.
// Shared with the list view, so the same fact does not get two shapes.
export function GateBadge({ check, size = 'md' }) {
  if (!check.gateOn) return null
  const sm = size === 'sm'
  return (
    <span
      title="Hard check — runs before anything is read, and a failure ends the examination."
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: sm ? 10 : 11, fontWeight: 700, letterSpacing: '0.03em', color: '#946400', background: '#FBEFCF', borderRadius: 6, padding: sm ? '2px 7px' : '3px 9px 3px 8px' }}
    >
      <Icon name="shield-alert" size={sm ? 11 : 13} color="currentColor" />
      HARD
    </span>
  )
}

export function TypeBadge({ check, size = 'md' }) {
  const sm = size === 'sm'
  return (
    <span
      title={check.typeHint}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: sm ? 10 : 11, fontWeight: 700, letterSpacing: '0.03em', color: check.typeColor, background: check.typeBg, borderRadius: 6, padding: sm ? '2px 7px' : '3px 9px 3px 8px' }}
    >
      <Icon name={check.typeIcon} size={sm ? 11 : 13} color="currentColor" />
      {check.typeLabel}
    </span>
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

// A card's own state, not a data tag — small caps so it reads as a stamp.
const statePill = { fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }
const SEVERITIES = [{ value: 'CRITICAL', label: 'Critical' }, { value: 'MAJOR', label: 'Major' }, { value: 'MINOR', label: 'Minor' }]
