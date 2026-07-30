import Icon from '@shared/ds/Icon'
import { Menu } from '@shared/ds/Menu'
import { Z } from '@shared/ds/z'
import RuleEditor from './RuleEditor'

// The body of a **judged** rule card.
//
// A judged rule is written in plain language — one requirement per dash line —
// and read against the whole presentation, or against a clause of the credit
// (46A, 47A) when the credit is what states it. Dictionary field names wrapped
// in braces bind to the field; the assistant resolves which document to read
// each from. `check` is the view-model from store.buildCheck().
export default function JudgedBody({ check }) {
  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <span style={{ position: 'absolute', top: 8, right: 8, zIndex: Z.popover }}>
        <Menu
          open={check.helpOpen}
          onClose={check.onToggleHelp}
          align="right"
          width={322}
          maxHeight={460}
          trigger={
            <button onClick={check.onToggleHelp} title="How to write this" style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--me-grey-15)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--me-grey-70)', fontSize: 13, fontWeight: 700 }}>?</button>
          }
        >
          <Help onClose={check.onToggleHelp} />
        </Menu>
      </span>
      <RuleEditor value={check.body} onChange={check.onChangeBody} onFocus={check.onFocus} fields={check.dictFields} />
    </div>
  )
}

function Help({ onClose }) {
  return (
    <div style={{ padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Writing a judged rule</div>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 2, marginRight: -2 }}><Icon name="x" size={15} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12, lineHeight: 1.5, color: 'var(--me-grey)' }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{'{Expiry date}'}</span>
          <span>Wrap a dictionary field name in braces to bind it — the assistant resolves which document to read it from.</span>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey)', flexShrink: 0, paddingTop: 1 }}>- …</span>
          <span>A dash line reads as one requirement. Say what must be true, and what to do when it isn't.</span>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-blue-deep)', flexShrink: 0, paddingTop: 1 }}>UCP600 Art.6</span>
          <span>References highlight on their own — or add them from the book.</span>
        </div>
        <div style={{ color: 'var(--me-grey-70)' }}>
          If a line is a hard comparison between two documents, move it to a <strong style={{ color: 'var(--me-ink)' }}>Rule card</strong> — it runs deterministically there, without a model.
        </div>
      </div>
      <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)' }}>
        <div style={{ fontSize: 11.5, color: 'var(--me-grey-70)', marginBottom: 7 }}>Logic words are optional — write freely; these just get highlighted so the reasoning reads clearly:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {['WHEN', 'IF', 'UNLESS', 'THEN', 'AND', 'OR', 'NOT', 'BEFORE', 'AFTER', 'WITHIN', 'AT LEAST'].map((k) => <span key={k} style={kwChipStruct}>{k}</span>)}
          {['MUST', 'SHOULD', 'MAY'].map((k) => <span key={k} style={kwChipModal}>{k}</span>)}
        </div>
      </div>
    </div>
  )
}

const kwChipStruct = { fontSize: 10.5, fontWeight: 600, color: 'var(--me-navy)', background: 'rgba(44,58,135,.10)', borderRadius: 4, padding: '2px 6px' }
const kwChipModal = { fontSize: 10.5, fontWeight: 700, color: '#946400', background: '#FBEFCF', borderRadius: 4, padding: '2px 6px' }
