import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { RangeSetBuilder, EditorState } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'

// A plain-language rule editor for check conditions. It highlights {field}
// tokens and UCP/ISBP references, autocompletes field codes from the Dictionary,
// and lints {tokens} that aren't defined there. Replaces the hand-rolled
// transparent-textarea overlay with CodeMirror 6.

// Reasoning keywords — highlighted only to help read the logic (and to give an
// LLM a clear scaffold). They are NOT required and NOT linted: writing stays
// free-form natural language; matching is case-insensitive and word-bounded.
// Tune these lists freely.
export const KW_STRUCT = [
  'when', 'whenever', 'if', 'unless', 'where', 'given', 'while', 'once',
  'then', 'otherwise', 'else', 'because', 'since', 'therefore', 'so that',
  'and', 'or', 'not', 'but', 'except', 'either', 'both', 'neither', 'any', 'all', 'none', 'only',
  'before', 'after', 'within', 'at least', 'at most', 'no later than', 'no earlier than',
  'same as', 'consistent with', 'corresponds to', 'matches', 'equals',
  'flag', 'raise', 'warn', 'hold', 'require', 'confirm', 'escalate', 'reject', 'waive',
]
export const KW_MODAL = ['must not', 'must', 'should not', 'should', 'may']

const alt = (arr) => arr.slice().sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')
const TOKEN_RE = new RegExp(
  '(\\{[^}\\n]*\\})' +
    '|(UCP\\s?600(?:\\s?art\\.?\\s?\\d+(?:\\([a-z0-9]+\\))*)?|ISBP\\s?821)' +
    `|\\b(${alt(KW_MODAL)})\\b` +
    `|\\b(${alt(KW_STRUCT)})\\b`,
  'gi'
)
const fieldMark = Decoration.mark({ class: 'cm-lc-field' })
const refMark = Decoration.mark({ class: 'cm-lc-ref' })
const modalMark = Decoration.mark({ class: 'cm-lc-modal' })
const kwMark = Decoration.mark({ class: 'cm-lc-kw' })

function buildDecorations(view) {
  const builder = new RangeSetBuilder()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let m
    TOKEN_RE.lastIndex = 0
    while ((m = TOKEN_RE.exec(text)) !== null) {
      const start = from + m.index
      builder.add(start, start + m[0].length, m[1] ? fieldMark : m[2] ? refMark : m[3] ? modalMark : kwMark)
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

// Autocomplete field names from the Dictionary while typing inside `{ … }`.
// Names are plain business words with spaces in them ("Latest shipment date"),
// so the token being completed runs to the brace, not to the first space.
function fieldCompletionSource(fields) {
  return (ctx) => {
    const token = ctx.matchBefore(/\{[^}\n]*/)
    if (!token) return null
    if (token.from + 1 === token.to && !ctx.explicit) return null
    return {
      from: token.from + 1,
      options: fields.map((f) => ({ label: f.name, detail: f.docs, type: 'variable', apply: f.name })),
    }
  }
}

// Warn on any {token} that isn't a field the Dictionary defines.
function unknownTokenLinter(fields) {
  const known = new Set(fields.map((f) => f.name))
  return linter((view) => {
    const diags = []
    const text = view.state.doc.toString()
    const re = /\{([^}\n]*)\}/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim()
      if (name && !known.has(name)) {
        diags.push({ from: m.index, to: m.index + m[0].length, severity: 'warning', message: `“${name}” isn't a field in the dictionary.` })
      }
    }
    return diags
  })
}

const theme = EditorView.theme({
  '&': { fontSize: '14px', color: 'var(--me-ink)', background: 'transparent' },
  // Grows to fit the whole rule — no inner scrollbar. The character limit
  // (maxLength) keeps a rule concise instead of a height cap.
  '&.cm-editor': { border: '1px solid var(--me-grey-20)', borderRadius: '10px', overflow: 'hidden' },
  '&.cm-editor.cm-focused': { outline: 'none', borderColor: 'var(--me-blue)', boxShadow: '0 0 0 3px rgba(4,115,234,.12)' },
  '.cm-content': { fontFamily: "'Hanken Grotesk', sans-serif", padding: '12px 14px', lineHeight: '1.75', caretColor: 'var(--me-ink)' },
  '.cm-scroller': { fontFamily: "'Hanken Grotesk', sans-serif", lineHeight: '1.75' },
  '.cm-lc-field': { color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: '3px', padding: '1px 1px' },
  '.cm-lc-ref': { color: 'var(--me-blue-deep)' },
  '.cm-lc-kw': { color: 'var(--me-navy)', fontWeight: '600' },
  '.cm-lc-modal': { color: '#946400', fontWeight: '700' },
})

// Reject any edit that would push the rule past the character limit — a hard cap
// that keeps a rule concise (and its auto-growing editor a sensible height).
const lengthCap = (max) => EditorState.transactionFilter.of((tr) => (tr.newDoc.length > max ? [] : tr))

export default function RuleEditor({ value, onChange, onFocus, fields = [], maxLength = 1200 }) {
  const extensions = useMemo(
    () => [highlightPlugin, EditorView.lineWrapping, autocompletion({ override: [fieldCompletionSource(fields)] }), unknownTokenLinter(fields), lengthCap(maxLength), theme],
    [fields, maxLength]
  )
  const near = value.length >= maxLength * 0.9
  return (
    <div>
      <CodeMirror
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        extensions={extensions}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, highlightSelectionMatches: false, searchKeymap: false, drawSelection: true }}
        style={{ minHeight: 64 }}
      />
      <div style={{ marginTop: 4, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums', color: near ? 'var(--status-warning)' : 'var(--me-grey-50)' }}>
        {value.length} / {maxLength}
      </div>
    </div>
  )
}
