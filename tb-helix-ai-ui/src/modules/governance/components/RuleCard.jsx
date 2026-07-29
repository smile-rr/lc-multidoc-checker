import Icon from '@shared/ds/Icon'
import Eyebrow from '@shared/ds/Eyebrow'
import IconButton from '@shared/ds/IconButton'
import Select from '@shared/ds/Select'
import TextArea from '@shared/ds/TextArea'
import { Menu, MenuItem, MenuHeader } from '@shared/ds/Menu'
import { ellipsis } from '@shared/ds/text'

// The body of a Rule card.
//
// A rule compares one field against another and runs deterministically — no
// model in the loop — so it is authored as rows rather than prose:
//
//     Applies to   when this rule runs at all
//     <field @ document>  <operator>  <field @ document | fixed value>  (qualifier)
//     Raise        the wording of the discrepancy when it fails
//
// Rows sit in bracketed blocks; within a block they are all-of or any-of, and
// each block after the first joins the one above it with AND or OR.
//
// The structural controls (add, remove, reorder) appear only while editing, so
// a saved rule reads as a statement rather than a form. "Edit rule" in the
// header is the way in.
export default function RuleCard({ check }) {
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--me-grey-15)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 11px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', borderRadius: '9px 9px 0 0' }}>
        <Eyebrow size="sm" style={{ flexShrink: 0, paddingTop: 5 }}>Applies to</Eyebrow>
        <span style={{ flex: 1, minWidth: 0 }}>
          <TextArea
            className="inline-edit"
            value={check.ruleScope}
            onChange={check.onChangeScope}
            onFocus={check.onFocus}
            placeholder="Every presentation"
            maxLines={2}
            maxLength={160}
            style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-ink)', padding: '3px 7px' }}
          />
        </span>
        {check.showEditEntry && (
          <button onClick={check.onStartEdit} style={{ ...ghostBtn, flexShrink: 0 }}>
            <Icon name="pencil" size={13} />Edit rule
          </button>
        )}
      </div>

      <div style={{ padding: '9px 11px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {check.ruleGroups.map((g) => (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {g.showConnector && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '1px 0' }}>
                <button
                  onClick={g.onToggleConnector}
                  title="Switch AND / OR between blocks"
                  style={{ border: '1px solid var(--me-blue-20)', background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', borderRadius: 5, padding: '2px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  {g.connector}
                </button>
                <span style={{ flex: 1, height: 1, background: 'var(--me-grey-15)' }} />
              </div>
            )}
            <div style={{ borderLeft: `2px solid ${g.railColor}`, borderRadius: 2, paddingLeft: 9, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {g.showHead && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={g.onToggleLogic} title="Switch between all-of and any-of" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--me-blue)' }}>{g.logicLabel}</button>
                  {check.editing && g.canRemove && (
                    <button onClick={g.onRemove} title="Remove this block — its conditions go with it" style={{ ...ghostBtn, height: 20, padding: '0 7px', fontSize: 10.5 }}>
                      <Icon name="trash-2" size={12} />Remove block
                    </button>
                  )}
                </div>
              )}
              {g.rows.map((r) => <Row key={r.id} r={r} check={check} />)}
              {check.editing && (
                <button onClick={g.onAddRow} style={{ ...dashBtn, alignSelf: 'flex-start', marginLeft: 32 }}>+ Condition</button>
              )}
            </div>
          </div>
        ))}
        {check.editing && (
          <button onClick={check.onAddGroup} style={{ ...dashBtn, alignSelf: 'flex-start' }}>+ Bracketed block</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 11px', borderTop: '1px solid var(--me-grey-15)', background: '#FCFCFC', borderRadius: '0 0 9px 9px' }}>
        <Eyebrow size="sm" style={{ flexShrink: 0, paddingTop: 5 }}>Raise</Eyebrow>
        <span style={{ flex: 1, minWidth: 0 }}>
          <TextArea
            className="inline-edit"
            value={check.ruleMessage}
            onChange={check.onChangeMessage}
            onFocus={check.onFocus}
            placeholder="Wording of the discrepancy when this fails…"
            maxLines={3}
            maxLength={300}
            style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-grey)', padding: '3px 7px' }}
          />
        </span>
      </div>
    </div>
  )
}

// One condition, on one line. Every part of it can give up width — the operand
// buttons ellipsise, the operator and the qualifier shrink — so a long row gets
// tighter rather than dropping its tail onto a second line. Only a genuinely
// narrow card wraps.
function Row({ r, check }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 30 }}>
      <span style={{ width: 26, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--me-grey-50)', textAlign: 'right' }}>{r.joiner}</span>
      <Operand o={r.left} flag={r.incomplete} />
      <Select
        size="sm"
        value={r.op}
        onChange={r.onChangeOp}
        onFocus={check.onFocus}
        title={r.opLabel}
        color="var(--me-blue-deep)"
        style={{ flex: '0 1 auto', minWidth: 96, maxWidth: 210, borderColor: 'var(--me-grey-15)' }}
        groups={r.opGroups.map((og) => ({ label: og.label, options: og.ops }))}
      />
      {r.showRight && <Operand o={r.right} flag={r.incomplete} />}
      {r.showTol && (
        <input
          className="inline-edit"
          value={r.tol}
          onChange={r.onChangeTol}
          onFocus={check.onFocus}
          placeholder="qualifier"
          title="Tolerance or qualifier — 5%, 21 calendar days, corresponds not identical"
          style={{ flex: '0 1 160px', minWidth: 96, height: 28, padding: '0 7px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey)' }}
        />
      )}
      {check.editing && (
        <IconButton icon="x" size="sm" tone="danger" title="Remove condition" onClick={r.onRemove} style={{ marginLeft: 'auto' }} />
      )}
    </div>
  )
}

// One side of a condition: a dictionary field read from a named document, or a
// fixed value / expression typed in place.
function Operand({ o, flag }) {
  if (o.isLiteral) {
    return (
      <input
        value={o.literal}
        onChange={o.onChangeLiteral}
        placeholder={o.literalPlaceholder}
        style={{ flex: '1 1 200px', minWidth: 140, maxWidth: 290, height: 28, border: `1px ${o.borderStyle} ${flag && !o.literal ? 'var(--status-warning)' : o.border}`, borderRadius: 6, padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-ink)', background: '#fff', outline: 'none' }}
      />
    )
  }
  const unset = !o.doc
  return (
    <Menu
      open={o.open}
      onClose={o.onToggle}
      width={320}
      maxHeight={260}
      trigger={
        <button
          onClick={o.onToggle}
          title={o.doc ? `${o.field} — read from ${o.doc}` : 'Pick the field this side reads'}
          style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0, maxWidth: 300, border: `1px ${o.borderStyle} ${flag && unset ? 'var(--status-warning)' : o.border}`, background: o.bg, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: o.color, textAlign: 'left' }}
        >
          <span style={ellipsis}>{o.field}</span>
          {o.doc && <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 500, opacity: 0.7 }}>{o.doc}</span>}
        </button>
      }
    >
      {o.onUseLiteral && <MenuItem label="A fixed value or expression…" icon="pencil" onClick={o.onUseLiteral} />}
      <MenuHeader>Field, as read from a document</MenuHeader>
      {o.book.map((op, i) => (
        <MenuItem key={i} label={op.field} hint={op.doc} title={op.note} onClick={op.onPick} selected={op.field === o.field && op.doc === o.doc} />
      ))}
    </Menu>
  )
}

const dashBtn = { border: '1px dashed var(--me-grey-20)', background: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)' }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', border: '1px solid var(--me-grey-20)', background: '#fff', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--me-grey)' }
