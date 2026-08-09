import Icon from '@shared/ds/Icon'
import { Menu } from '@shared/ds/Menu'
import RuleEditor from './RuleEditor'
import ExpressionSimulator from './ExpressionSimulator'
import GateSwitch from './GateSwitch'

/**
 * The body of an **expression** rule card: one text box, and a way to try it.
 *
 * Deliberately the shape of the Agent card — one editor, one help menu, one line of wording
 * underneath. The difference is what the editor holds: a WHEN/THEN/ELSE table instead of
 * prose. There are no per-condition widgets, no grade selects and no add/remove buttons,
 * because the table already says all of that in text and saying it twice is how the two come
 * to disagree — and no wording box either. What a check raises is its title and the
 * comparison it made; a free-text line beside them was a third place to say the same thing,
 * and the one most likely to end up describing a rule that has since been edited.
 *
 * Nothing here decides what a table may contain or what it came to. The service parses it,
 * refuses anything unsafe, checks every name against the dictionary and answers with the
 * outcome; a copy of that judgement in the browser would be a second place for it to be
 * wrong, and the wrong one is the one nobody notices.
 */
export default function ExpressionBody({ check }) {
  const e = check.expr
  return (
    <div style={{ marginTop: 12 }}>
      <div style={railRow}>
        <div style={{ flex: 1 }} />
        <Menu
          open={check.helpOpen}
          onClose={check.onToggleHelp}
          align="right"
          width={420}
          maxHeight={470}
          trigger={<button onClick={check.onToggleHelp} title="How to write this" style={helpBtn}>?</button>}
        >
          <ExpressionHelp onClose={check.onToggleHelp} grammar={e.grammar} />
        </Menu>
      </div>

      {/* A table settled without a model can run before anything is read, so it can be a
          threshold check — and until now the only place to say so was inside the tree body,
          which is the card being retired. When it cannot be one the control stays, disabled,
          with the reason showing: an author who wants a gate needs to know what would make
          one, and a control that vanishes teaches nothing. */}
      {e.canGate ? (
        <div style={gateWrap}><GateSwitch check={check} /></div>
      ) : null}

      <div style={{ borderRadius: 8, ...(e.missing ? warnRing : null) }}>
        <RuleEditor
          value={e.source}
          onChange={e.onChange}
          onFocus={check.onFocus}
          language="expression"
          reads={e.reads}
          verbs={e.verbs}
          maxLength={1200}
        />
      </div>

      {e.missing ? (
        <div style={warnText}>
          This is the comparison the examination makes — an expression check with nothing here
          compares nothing.
        </div>
      ) : null}

      <ExpressionSimulator sim={e.sim} />
    </div>
  )
}

/**
 * How to write one — the SERVICE's own text, verbatim.
 *
 * The table's syntax and the condition language beneath it, in one string, because an author
 * reads them together. The same string is given to a model writing checks, so an author and
 * the planner cannot come to believe different things about what is allowed. Exported because
 * the Simulator page needs the identical text; a second copy would be a second thing to keep
 * in step.
 */
export function ExpressionHelp({ onClose, grammar }) {
  return (
    <div style={{ padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Writing a check</div>
        {onClose ? (
          <button onClick={onClose} title="Close" style={closeBtn}><Icon name="x" size={15} /></button>
        ) : null}
      </div>
      <pre style={grammarText}>
        {grammar || 'The language is described by the service, and it could not be reached.'}
      </pre>
    </div>
  )
}

const gateWrap = { border: '1px solid var(--me-grey-15)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }
const railRow = { display: 'flex', alignItems: 'center', marginBottom: 4 }
const helpBtn = { width: 22, height: 22, borderRadius: 6, border: '1px solid var(--me-grey-15)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--me-grey-70)', fontSize: 12, fontWeight: 700 }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 2, marginRight: -2 }
const grammarText = { margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, color: 'var(--me-grey)' }
const warnRing = { boxShadow: '0 0 0 1px var(--status-warning)', background: 'var(--status-warning-bg, #fff8ee)' }
const warnText = { fontSize: 11, color: 'var(--status-warning)', paddingLeft: 2 }
