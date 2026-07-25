import { useRef, useLayoutEffect } from 'react'

// A textarea that grows to fit its content — no inner scrollbar, every line shown.
// Growth is bounded by `maxLength` on the content itself, not by a height cap, so
// fields stay concise without ever trapping the scroll wheel.
export default function AutoTextarea({ value, onChange, style, ...rest }) {
  const ref = useRef(null)
  const fit = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  useLayoutEffect(() => { fit(ref.current) }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange(e); fit(e.target) }}
      rows={1}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...rest}
    />
  )
}
