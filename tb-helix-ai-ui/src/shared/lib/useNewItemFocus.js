import { useEffect, useRef } from 'react'

// Give the caret to a just-created item and bring it on screen.
//
// Attach the returned ref to the field that should be typed into first — the
// name, the title, the thing the item is nothing without. Adding something and
// then having to find it is the whole complaint about where new items land, and
// moving the item only solves half of it: the page may not be scrolled to where
// it landed either.
//
// Two details that matter:
//   · focus({preventScroll}) then scrollIntoView, so the browser's own
//     scroll-on-focus doesn't fight the centred scroll
//   · inside requestAnimationFrame, because a smooth scroll requested in the
//     same frame as a view switch is dropped
export function useNewItemFocus(isNew) {
  const ref = useRef(null)
  useEffect(() => {
    if (!isNew) return undefined
    const frame = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.select?.()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [isNew])
  return ref
}

/** Scroll to whatever is unfinished and put the caret back in it. Used by the
 *  "finish this first" notice, which knows an id but not a ref. */
export function focusItem(id) {
  if (typeof document === 'undefined' || !id) return
  const host = document.querySelector(`[data-item-id="${id}"]`)
  if (!host) return
  host.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const field = host.querySelector('input, textarea, .cm-content')
  if (field) field.focus({ preventScroll: true })
}
