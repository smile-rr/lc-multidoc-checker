import Icon from '@shared/ds/Icon'
import Eyebrow from '@shared/ds/Eyebrow'
import IconButton from '@shared/ds/IconButton'
import Select from '@shared/ds/Select'
import SegmentedControl from '@shared/ds/SegmentedControl'
import TextArea from '@shared/ds/TextArea'
import { Menu, MenuItem, MenuHeader, MenuEmpty } from '@shared/ds/Menu'
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
// Gate — "run this before anything is read", and separately, "here is
// what a failure means".
//
// It sits under *Applies to* because that is the same question: when does this rule
// run. Three things decide it and only two are the author's:
//
//   whether it *can* run first is derived from the operands — a rule that reads the
//   bill of lading cannot run before the bill of lading has been read
//   whether it *does* run first is the toggle
//   what a failure *means* is the second control, and nothing can derive it
//
// The last one used to be part of the toggle: turning a check into a gate asserted
// both that it runs first and that its failure ends the examination. Those are not
// the same claim. Presentation after expiry ends it; a gate on the place
// of presentation may well be a discrepancy worth recording while the examination
// carries on. So the author says which, and the planner may still overrule it for
// one credit whose own :47A: bears on the ground — because a credit can extend its
// own presentation period, and a rule authored months earlier cannot know that.
//
// When it cannot run first, the toggle is disabled **with the reason showing**, not
// hidden. An author who wants a gate needs to know what would make one,
// and a control that vanishes teaches nothing.
//
// The consequence is stated rather than left to the run: under UCP 600 art. 16(c) a
// refusing bank gives one notice stating every discrepancy, so stopping early means
// the notice carries this ground alone.
function GateSwitch({ check }) {
  const on = check.gateOn
  const can = check.gateEligible
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7, padding: '8px 11px',
      borderBottom: '1px solid var(--me-grey-15)',
      background: on ? '#FBEFCF' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <button
          onClick={check.onToggleGate ?? undefined}
          disabled={!can}
          aria-pressed={on}
          title={can ? undefined : check.gateWhy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
            background: 'none', border: 'none', padding: 0, marginTop: 1,
            cursor: can ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 600,
            color: !can ? 'var(--me-grey-50)' : on ? '#946400' : 'var(--me-grey)',
            opacity: can ? 1 : 0.75,
          }}
        >
          <Icon name={on ? 'toggle-right' : 'toggle-left'} size={20} color="currentColor" />
          Gate
        </button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.5, color: on ? '#946400' : 'var(--me-grey-70)' }}>
          {!can
            ? check.gateWhy
            : on
              ? 'Runs on the credit and the presentation record alone, before a page is read.'
              : check.gateWhy}
        </span>
      </div>

      {/* Only once it is a gate. Asking what a failure means of a rule
          that runs with all the others is asking about a situation that cannot
          arise. */}
      {on ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', paddingLeft: 27 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#946400', flexShrink: 0 }}>When it fails</span>
          <SegmentedControl
            size="sm"
            value={check.onFail ?? 'STOP'}
            onChange={check.onSetOnFail}
            items={[
              { id: 'STOP', label: 'Stop the examination', tip: 'Nothing in the presentation could change this answer, so reading on is spend on a settled question. The refusal notice states this ground alone — under art. 16(c) there is only one notice.' },
              { id: 'CONTINUE', label: 'Keep examining', tip: 'Record the discrepancy and carry on, so the notice can state this ground and everything else the run finds.' },
            ]}
          />
        </div>
      ) : null}
    </div>
  )
}

export default function ExactBody({ check }) {
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

      <GateSwitch check={check} />

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
            required
            invalid={check.messageMissing}
            hint="This is the wording an officer reads on the finding."
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
      {/* Offered wherever there is a right-hand side, because that is where an author
          reaches for it — but only three operators read one. On the rest it is inert,
          and it says so rather than reading like an instruction: a qualifier of
          "corresponds, not identical" beside `equals` is discarded, and the comparison
          run is a strict string equality. */}
      {r.showTol && (
        <input
          className="inline-edit"
          value={r.tol}
          onChange={r.onChangeTol}
          onFocus={check.onFocus}
          placeholder={r.tolUsed ? 'qualifier' : 'note (not read)'}
          title={r.tolUsed
            ? 'Tolerance — 5%, 21 calendar days. This operator reads it.'
            : `“${r.opLabel}” does not read a qualifier. Anything typed here is a note for a reader, not part of the comparison.`}
          style={{ flex: '0 1 160px', minWidth: 96, height: 28, padding: '0 7px', fontFamily: 'var(--font-mono)', fontSize: 11, color: r.tolUsed ? 'var(--me-grey)' : 'var(--me-grey-50)', fontStyle: r.tolUsed ? 'normal' : 'italic' }}
        />
      )}
      {check.editing && (
        <IconButton icon="x" size="sm" tone="danger" title="Remove condition" onClick={r.onRemove} style={{ marginLeft: 'auto' }} />
      )}
    </div>
  )
}

// One side of a condition: a dictionary field read from a named document, a fixed
// value typed in place, or a value the condition works out for itself.
//
// The third is shown and not edited. The planner writes them — "within 21 days of
// shipment" is an on-board date, a number and an addition, and no field holds the
// answer — and composing one here means picking a function, then operands for its
// arguments, then operands for theirs. That is an editor of its own. Rendering it
// read-only is the honest interim: an author can see exactly what will be compared
// and can replace the whole operand, which is the change they would want anyway.
function Operand({ o, flag }) {
  if (o.isComputed) {
    return (
      <span
        title="Worked out from the presentation. Written by the planner; replace the operand to change it."
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 300, border: '1px dashed var(--me-blue-20)', background: 'var(--me-blue-20)', borderRadius: 6, padding: '4px 9px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-blue-deep)' }}
      >
        <span style={ellipsis}>{o.computedText}</span>
      </span>
    )
  }
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
      {/* Grouped by document, because an operand is a field ON a document — you are
          picking the invoice's value, not the value that happens to be on an invoice.
          The dictionary defines a field once and lists where it is read; this is the
          same rows read the other way round. */}
      {o.book.map((group) => (
        <div key={group.docName}>
          <MenuHeader>{group.docName}</MenuHeader>
          {group.fields.map((op, i) => (
            <MenuItem key={i} label={op.field} title={op.note} onClick={op.onPick} selected={op.selected} />
          ))}
        </div>
      ))}
      {o.unbound && o.unbound.length ? (
        <MenuEmpty>
          {o.unbound.length === 1 ? `“${o.unbound[0]}” is not here` : `${o.unbound.length} fields are not here`}
          {' '}— a field can only be compared once the dictionary says which document it is read from.
        </MenuEmpty>
      ) : null}
    </Menu>
  )
}

const dashBtn = { border: '1px dashed var(--me-grey-20)', background: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)' }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', border: '1px solid var(--me-grey-20)', background: '#fff', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--me-grey)' }
