import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import { Menu, MenuItem } from '@shared/ds/Menu'
import OutcomeCell from './OutcomeCell'
import { outcomeOptions, outcomeMeta } from '../state/outcome'

// The officer's call on one finding — the outcome, and the way to change it.
//
// **The value is the control.** You click what it currently says and pick what it
// should say. That is one thing on the row instead of two, it saves the column a
// separate button cluster needed, and it makes the affordance obvious in the place
// people already look for the answer.
//
// This replaced a pair of action buttons, and the reason was a trap rather than a
// preference. Those buttons offered only what would change something — one on a row
// the engine had settled, two where it had not — which read well and then stranded
// anybody who mis-tagged a row: once overridden the only remaining action was
// *Undo*, so a mistaken Discrepant could not go straight to Clean, and the missing
// option reasonably read as "this cannot be changed". Every value reachable from
// every other is worth more than a control that never shows a no-op.
//
// What survives from that idea is the ordering: the current value is marked rather
// than removed, so choosing it again is possible and simply does nothing, and the
// reset is separated below a rule because it is not a fourth outcome — it is asking
// for your own mark to come off.
// `size` is deliberately not a prop any more. The trigger appears on three surfaces —
// the findings table, the finding's own header, the decision list — and each had
// been given a size that suited its neighbours: 11, 13, 12. Three widths and three
// type sizes for one control is three controls to learn, and the chevron that says
// "this can be changed" was the first thing to get lost at the small end. One size,
// everywhere, so recognising it once is enough.
export default function OutcomeSelect({ call, onPick, align = 'left', drop = 'down' }) {
  const size = 12
  const [open, setOpen] = useState(false)
  const options = outcomeOptions(call)

  // Nothing has run, so there is nothing to disagree with. The cell still states the
  // outcome; it just is not a control.
  if (call.value === 'NOT_RUN' && !call.overridden) {
    return <OutcomeCell call={call} size={size} />
  }

  const pick = (id) => {
    setOpen(false)
    onPick(id)
  }

  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      drop={drop}
      width={196}
      top={28}
      trigger={(
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Change what this is raised as"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 6px',
            margin: '-3px -6px',
            borderRadius: 7,
            // No border and no fill until you approach it. A list of twenty rows
            // with twenty outlined controls down one side reads as a form to fill
            // in, and this is a list to read — most rows will never be touched.
            border: '1px solid transparent',
            background: open ? 'var(--me-grey-08)' : 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
            // **Never shrink below the content.** It carried `maxWidth: 100%` and
            // `minWidth: 0`, which is right for a cell whose text can ellipsise and
            // wrong for this one: the label inside is `nowrap`, so a squeezed trigger
            // did not clip — it overflowed, and the overflow painted straight over
            // the chevron. The findings table hid the bug behind a fixed 152px track;
            // in the detail header and on the decision row, both flex contexts that
            // hand out space by content size, the arrow disappeared under the word.
            // The container yields instead — see the two call sites.
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--me-grey-20)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent' }}
        >
          <OutcomeCell call={call} size={size} />
          <Icon name="chevron-down" size={12} color="var(--me-grey-50)" />
        </button>
      )}
    >
      {options.map((o) => (
        // The reset is separated by a rule because it is not a fourth outcome — it
        // is asking for your own mark to come off the row.
        <div key={o.id} style={o.reset ? { borderTop: '1px solid var(--me-grey-15)', marginTop: 4, paddingTop: 4 } : undefined}>
          <MenuItem
            label={o.label}
            icon={o.icon}
            color={o.reset ? 'var(--me-blue-deep)' : outcomeMeta(o.id).dot}
            // Marked, not removed. A menu that drops the value you are on reflows
            // between opens, and you lose sight of what you are changing *from*.
            selected={o.current}
            onClick={() => pick(o.id)}
          />
        </div>
      ))}
    </Menu>
  )
}
