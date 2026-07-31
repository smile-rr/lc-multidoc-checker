import { Component } from 'react'
import Icon from './Icon'

// The blast radius of a render error.
//
// React unmounts the whole tree when a render throws and nothing catches it, so
// one component reading a field that turned out to be absent takes the entire
// application to a white screen. That is the worst possible failure for a
// workbench: the officer loses the case they were reading, there is nothing on
// screen to report, and the only clue is in a console they are not looking at.
//
// A boundary per pane means the pane fails and the rest of the case stays up —
// the header, the tabs, the document beside it. What is lost is bounded by where
// these are placed, which is why they go around the parts that render
// service-shaped data rather than once around the router.
//
// Class component because there is no hook equivalent: `componentDidCatch` and
// `getDerivedStateFromError` are the only API React offers for this.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept, because the message on screen is deliberately short and somebody will
    // want the stack. `console.error` is where a browser's own error reporting
    // already looks.
    console.error('[helix] render failed in', this.props.label ?? 'a panel', error, info?.componentStack)
  }

  // A new subject is a new chance: switching case or stage must not stay broken
  // because the previous one was. Without this the boundary latches and the pane
  // is dead until a reload.
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '20px 22px', margin: 12,
          border: '1px solid var(--me-grey-15)', borderRadius: 10,
          background: 'var(--me-grey-08)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--me-ink)' }}>
          <Icon name="triangle-alert" size={15} color="var(--status-error)" />
          {this.props.label ?? 'This panel'} could not be shown
        </span>
        {/* Says what is and is not affected. A blank pane with an apology leaves
            the officer guessing whether the examination itself is damaged. */}
        <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey-70)' }}>
          The examination is unaffected — this is a display fault, and nothing about the case
          has changed. The rest of the workbench is still usable; switching stage and back
          will try again.
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', wordBreak: 'break-word' }}>
          {String(this.state.error?.message ?? this.state.error)}
        </span>
      </div>
    )
  }
}
