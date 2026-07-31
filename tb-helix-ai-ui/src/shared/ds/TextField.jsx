// The single-line text field.
//
// The console had no such component, so every editable one-line value — a
// document code, a field name, a check title — was a bare `<input
// className="inline-edit">` with its own inline style object. Twelve copies of
// the same thing, none of which could be given a behaviour without finding all
// twelve.
//
// The behaviour that prompted it is `required`. A dictionary row saved with an
// empty name is not a row anybody can find again, and a document type saved
// with an empty code cannot be saved at all — the service rejects it, and the
// console's only clue was a toast. Marking the field is better than explaining
// the failure afterwards.
//
//   required   the value may not be blank. An empty required field shows its
//              rail in the warning colour once it has been touched, and
//              `isBlank` below is how a card decides whether Save is allowed.
//   invalid    force the warning state for a reason this field cannot see —
//              a duplicate key, say, which needs the whole list to detect.
//   hint       what is wrong, or what good looks like. Shown under the field.

import { forwardRef, useState } from 'react'

/** Whether a required value counts as missing. Whitespace is not an answer. */
export const isBlank = (value) => String(value ?? '').trim() === ''

/**
 * Are all of these present?
 *
 * Used by a card to decide whether Save is allowed, so the rule lives with the
 * fields rather than being restated in the button.
 */
export const allPresent = (...values) => values.every((v) => !isBlank(v))

// forwardRef, because `useNewItemFocus` gives the caret to a just-created row by
// attaching a ref to the field it should be typed into — and that has to reach the
// input, not the wrapper.
const TextField = forwardRef(function TextField({
  value = '',
  onChange,
  required = false,
  invalid = false,
  hint,
  mono = false,
  style,
  onBlur,
  ...rest
}, ref) {
  // Untouched fields stay quiet. A form that turns red before anyone has typed
  // in it is scolding someone for not having finished yet.
  const [touched, setTouched] = useState(false)
  const missing = required && touched && isBlank(value)
  const bad = missing || invalid

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: style?.flex }}>
      <input
        ref={ref}
        className="inline-edit"
        value={value}
        onChange={onChange}
        onBlur={(e) => { setTouched(true); onBlur?.(e) }}
        aria-required={required || undefined}
        aria-invalid={bad || undefined}
        style={{
          padding: '6px 9px',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontSize: mono ? 12 : 13,
          fontWeight: mono ? 600 : 500,
          color: 'var(--me-ink)',
          minWidth: 0,
          ...style,
          // After the caller's style, so a required field cannot be styled out
          // of saying so.
          ...(bad ? { borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg, #fff8ee)' } : null),
        }}
        {...rest}
      />
      {bad && hint ? (
        <span style={{ fontSize: 11, color: 'var(--status-warning)', paddingLeft: 9 }}>{hint}</span>
      ) : null}
    </span>
  )
})

export default TextField
