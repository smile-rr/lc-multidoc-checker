import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'

// A plain-language rule editor for check conditions. It highlights {field}
// tokens and UCP/ISBP references, autocompletes field codes from the Dictionary,
// and lints {tokens} that aren't defined there. Replaces the hand-rolled
// transparent-textarea overlay with CodeMirror 6.

const TOKEN_RE = /(\{[^}\n]*\})|(UCP\s?600(?:\s?art\.?\s?\d+(?:\([a-z0-9]+\))*)?|ISBP\s?821)/gi
const fieldMark = Decoration.mark({ class: 'cm-lc-field' })
const refMark = Decoration.mark({ class: 'cm-lc-ref' })

function buildDecorations(view) {
  const builder = new RangeSetBuilder()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let m
    TOKEN_RE.lastIndex = 0
    while ((m = TOKEN_RE.exec(text)) !== null) {
      const start = from + m.index
      builder.add(start, start + m[0].length, m[1] ? fieldMark : refMark)
    }
  }
  return builder.finish()
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildDecorations(view) }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view) }
  },
  { decorations: (v) => v.decorations }
)

// Autocomplete field codes from the Dictionary while typing inside `{ … }`.
function fieldCompletionSource(fields) {
  return (ctx) => {
    const token = ctx.matchBefore(/\{[A-Za-z0-9.]*/)
    if (!token) return null
    if (token.from + 1 === token.to && !ctx.explicit) return null
    return {
      from: token.from + 1,
      options: fields.map((f) => ({ label: f.code, detail: f.name, type: 'variable', apply: f.code })),
    }
  }
}

// Warn on any {token} whose code isn't a defined Dictionary field.
function unknownTokenLinter(fields) {
  const known = new Set(fields.map((f) => f.code))
  return linter((view) => {
    const diags = []
    const text = view.state.doc.toString()
    const re = /\{([^}\n]*)\}/g
    let m
    while ((m = re.exec(text)) !== null) {
      const code = m[1].trim()
      if (code && !known.has(code)) {
        diags.push({ from: m.index, to: m.index + m[0].length, severity: 'warning', message: `“${code}” isn't a field in the dictionary.` })
      }
    }
    return diags
  })
}

const theme = EditorView.theme({
  '&': { fontSize: '14px', color: 'var(--me-ink)', background: 'transparent' },
  '&.cm-editor': { border: '1px solid var(--me-grey-20)', borderRadius: '10px', overflow: 'hidden' },
  '&.cm-editor.cm-focused': { outline: 'none', borderColor: 'var(--me-blue)', boxShadow: '0 0 0 3px rgba(4,115,234,.12)' },
  '.cm-content': { fontFamily: "'Hanken Grotesk', sans-serif", padding: '12px 14px', lineHeight: '1.75', caretColor: 'var(--me-ink)' },
  '.cm-scroller': { fontFamily: "'Hanken Grotesk', sans-serif", lineHeight: '1.75' },
  '.cm-lc-field': { color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: '3px', padding: '1px 1px' },
  '.cm-lc-ref': { color: 'var(--me-blue-deep)' },
  '.cm-tooltip-autocomplete .cm-completionLabel': { fontFamily: "'Roboto Mono', monospace" },
})

export default function RuleEditor({ value, onChange, onFocus, fields = [] }) {
  const extensions = useMemo(
    () => [highlightPlugin, EditorView.lineWrapping, autocompletion({ override: [fieldCompletionSource(fields)] }), unknownTokenLinter(fields), theme],
    [fields]
  )
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      extensions={extensions}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, highlightSelectionMatches: false, searchKeymap: false, drawSelection: true }}
      style={{ minHeight: 64 }}
    />
  )
}
