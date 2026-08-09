import Icon from '@shared/ds/Icon'
import SegmentedControl from '@shared/ds/SegmentedControl'

// Its own file because BOTH kinds of exact check can be a gate, and it lived inside the
// tree body — so an expression check, which is the kind everything is being written as
// now, had no way to become a threshold check at all. The control was not missing from
// the design; it was reachable only from a card being retired.
//
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

export default GateSwitch
