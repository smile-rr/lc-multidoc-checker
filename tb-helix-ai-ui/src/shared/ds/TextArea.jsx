import { useRef, useState, useLayoutEffect } from 'react'

// The multi-line text field.
//
// Every editable prose field in the console uses this one component, so a
// description, a binding note and an article body all behave the same way:
// Enter starts a new line, the box grows to fit what has been typed, and it
// stops growing at a stated ceiling instead of running down the page.
//
//   maxLines   how many lines it may grow to before it scrolls (0 / undefined
//              = grow to fit, never scroll)
//   maxLength  hard character cap — the browser refuses typing and truncates a
//              paste past it, so the value can never exceed it
//   showCount  always show the counter; otherwise it appears only once the text
//              is within 10% of the character cap
//   singleLine strip newlines as they arrive, for a field that must stay one
//              line but still needs the growing/limiting behaviour
//   required   the value may not be blank. Marks itself once touched, the same
//              way TextField does — a description and a name should not disagree
//              about what "you have to fill this in" looks like.
//   hint       what is wrong, shown under the field when it is
export default function TextArea({
  value = '',
  onChange,
  maxLines,
  maxLength,
  showCount = false,
  singleLine = false,
  required = false,
  invalid = false,
  hint,
  style,
  onBlur,
  ...rest
}) {
  const ref = useRef(null)
  const [touched, setTouched] = useState(false)
  const bad = invalid || (required && touched && String(value ?? '').trim() === '')

  // Grow to the content, then clamp at maxLines and hand the overflow to a
  // scrollbar. Measured from the element's own line-height so the ceiling holds
  // whatever type size the caller styles it with.
  const fit = (el) => {
    if (!el) return
    el.style.height = 'auto'
    let max = Infinity
    if (maxLines > 0) {
      const cs = window.getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
      const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      max = lh * maxLines + chrome
    }
    const h = Math.min(el.scrollHeight, max)
    el.style.height = `${h}px`
    el.style.overflowY = el.scrollHeight > max + 1 ? 'auto' : 'hidden'
  }

  useLayoutEffect(() => { fit(ref.current) })

  const handle = (e) => {
    if (singleLine && e.target.value.includes('\n')) {
      e.target.value = e.target.value.replace(/\n+/g, ' ')
    }
    onChange?.(e)
    fit(e.target)
  }

  const len = String(value).length
  const counted = maxLength != null && (showCount || len >= maxLength * 0.9)

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={handle}
        onKeyDown={singleLine ? (e) => { if (e.key === 'Enter') e.preventDefault() } : undefined}
        onBlur={(e) => { setTouched(true); onBlur?.(e) }}
        maxLength={maxLength}
        rows={1}
        aria-required={required || undefined}
        aria-invalid={bad || undefined}
        style={{
          resize: 'none',
          overflow: 'hidden',
          ...style,
          ...(bad ? { borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg, #fff8ee)' } : null),
        }}
        {...rest}
      />
      {bad && hint ? (
        <div style={{ fontSize: 11, color: 'var(--status-warning)', paddingLeft: 9 }}>{hint}</div>
      ) : null}
      {counted && (
        <div style={{ marginTop: 2, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums', color: len >= maxLength ? 'var(--status-warning)' : 'var(--me-grey-50)' }}>
          {len} / {maxLength}
        </div>
      )}
    </>
  )
}
