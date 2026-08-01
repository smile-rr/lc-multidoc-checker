import { useEffect, useRef } from 'react'

// Arrow keys over a detail-mode left rail, and Escape back to the overview.
//
// Only while something is selected — the overview is a table you click into, not
// a list you arrow through. Typing targets (notes, filters, CodeMirror) keep
// their own arrows; we never steal those.
//
// `ids` is the visible order: folded groups and collapsed "clean/skipped" bands
// stay out of the sequence, so the keys match what is on screen.

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return !!el.closest?.('[contenteditable="true"], .cm-editor, .cm-content')
}

export function useRailNav({ ids, selectedId, onSelect, onClear, enabled = true }) {
  const idsRef = useRef(ids)
  idsRef.current = ids
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const clearRef = useRef(onClear)
  clearRef.current = onClear

  const active = enabled && !!selectedId

  useEffect(() => {
    if (!active) return undefined

    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      if (e.key === 'Escape') {
        e.preventDefault()
        clearRef.current?.()
        return
      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = idsRef.current
      if (!list.length) return

      const cur = selectedRef.current
      const i = list.indexOf(cur)
      const next = e.key === 'ArrowDown'
        ? (i < 0 ? list[0] : list[Math.min(i + 1, list.length - 1)])
        : (i < 0 ? list[list.length - 1] : list[Math.max(i - 1, 0)])
      if (next === cur) return

      e.preventDefault()
      selectRef.current?.(next)
      requestAnimationFrame(() => {
        document.querySelector(`[data-rail-id="${CSS.escape(next)}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      })
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
