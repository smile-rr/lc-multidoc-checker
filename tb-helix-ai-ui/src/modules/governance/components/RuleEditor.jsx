import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { RangeSetBuilder, EditorState } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'

// One editor, two grammars. `prose` is a judged rule; `expression` is a WHEN/THEN/ELSE
// decision table whose conditions are SpEL. Everything outside the grammar — the theme, the
// auto-grow, the cap and the counter — is shared, so the cards look like one product by
// construction rather than by copying.
//
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
// ---- The expression language -----------------------------------------------
//
// The same editor, a different grammar. Reusing the shell rather than writing a second
// editor is what keeps the two cards looking like one product: the theme, the auto-grow,
// the character cap and the counter are shared verbatim, so they cannot drift apart.
//
// What is NOT here is any judgement about what an expression may contain. The allow list
// over the parsed tree lives in one package on the server and nowhere else — a copy in the
// browser would be a second place for it to be wrong, and the one that is wrong is the one
// nobody notices. This highlights and completes; the service decides.
const EXPR_RE = new RegExp(
  '(\\{[^}\\n]*\\})' +                            // {DOC.field}
    '|(#[A-Za-z][A-Za-z0-9]*)' +                     // #verb
    '|("[^"\\n]*")' +                                // "clean" — the table's answer
    '|(\'[^\'\\n]*\')' +                             // 'literal' — a value in a condition
    '|\\b(WHEN|THEN|ELSE)\\b' +                      // the only three keywords
    '|(>=|<=|==|!=|>|<)' +                           // comparison
    '|\\b(and|or)\\b' +                              // the only connectives
    '|\\b(\\d+(?:\\.\\d+)?)\\b',                      // number
  'gi'
)
const verbMark = Decoration.mark({ class: 'cm-lc-verb' })
const opMark = Decoration.mark({ class: 'cm-lc-op' })
const litMark = Decoration.mark({ class: 'cm-lc-lit' })
const numMark = Decoration.mark({ class: 'cm-lc-num' })
// The table's own words, and its answers. Weighted above everything else in the box, because
// WHEN/THEN/ELSE is the structure and the conditions hang off it.
const tableMark = Decoration.mark({ class: 'cm-lc-table' })
const answerMark = Decoration.mark({ class: 'cm-lc-answer' })

function buildExpressionDecorations(view) {
  const builder = new RangeSetBuilder()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let m
    EXPR_RE.lastIndex = 0
    while ((m = EXPR_RE.exec(text)) !== null) {
      const start = from + m.index
      const mark = m[1] ? fieldMark : m[2] ? verbMark : m[3] ? answerMark
        : m[4] ? litMark : m[5] ? tableMark : m[6] ? opMark : m[7] ? kwMark : numMark
      builder.add(start, start + m[0].length, mark)
    }
  }
  return builder.finish()
}

// Completes a readable name inside `{ … }`, and a verb after `#`. Both lists come from the
// service — an editor offering {BOL.port_of_lading} is how that typo gets written.
function expressionCompletionSource(reads, verbs) {
  return (ctx) => {
    const brace = ctx.matchBefore(/\{[^}\n]*/)
    if (brace) {
      return {
        from: brace.from + 1,
        options: reads.map((r) => ({
          label: r.name, detail: r.valueType ? r.valueType.toLowerCase() : r.docLabel,
          info: r.label, type: 'variable', apply: r.name,
        })),
      }
    }
    const hash = ctx.matchBefore(/#[A-Za-z]*/)
    if (!hash) return null
    return {
      from: hash.from + 1,
      options: verbs.map((v) => ({
        label: v.name, detail: v.arity < 0 ? '(a, b, …)' : `(${v.arity})`,
        info: v.about, type: 'function', apply: v.name,
      })),
    }
  }
}

// Warns on a name the dictionary does not bind. NOT a grammar check — the service does
// that, and says so in the panel below the editor.
function unknownNameLinter(reads) {
  const known = new Set(reads.map((r) => r.name))
  return linter((view) => {
    const diags = []
    const text = view.state.doc.toString()
    const re = /\{([^}\n]*)\}/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim()
      if (name && !name.startsWith('*') && !known.has(name)) {
        diags.push({
          from: m.index, to: m.index + m[0].length, severity: 'warning',
          message: `Nothing reads “${name}”. Names are DOCUMENT.field — try {LC.expiry_date}.`,
        })
      }
    }
    return diags
  })
}

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

const plugin = (build) => ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = build(view) }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view) }
  },
  { decorations: (v) => v.decorations }
)
const highlightPlugin = plugin(buildDecorations)
const expressionPlugin = plugin(buildExpressionDecorations)

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
  '.cm-lc-verb': { color: 'var(--me-navy)', fontWeight: '600' },
  '.cm-lc-op': { color: '#946400', fontWeight: '700' },
  '.cm-lc-lit': { color: '#1F7A00' },
  '.cm-lc-num': { color: '#1F7A00' },
  '.cm-lc-table': { color: 'var(--me-navy)', fontWeight: '800', textTransform: 'uppercase' },
  '.cm-lc-answer': { color: '#946400', fontWeight: '700' },
})

// An expression is one line of a technical language, so it reads in the monospace face the
// rest of the console uses for values — the prose editor stays in the text face, because it
// is prose.
const expressionTheme = EditorView.theme({
  '.cm-content': { fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.7' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
})

// Reject any edit that would push the rule past the character limit — a hard cap
// that keeps a rule concise (and its auto-growing editor a sensible height).
const lengthCap = (max) => EditorState.transactionFilter.of((tr) => (tr.newDoc.length > max ? [] : tr))

/**
 * @param language `prose` for a judged rule, `expression` for a condition. One editor either
 *   way: everything outside the grammar — the theme, the auto-grow, the cap, the counter —
 *   is shared, so the two cards look like one product by construction rather than by copying.
 * @param reads what a condition may read, from the service. Not the dictionary's field NAMES,
 *   which is what the prose editor completes: an expression names DOCUMENT.field.
 */
// One empty array, not a fresh one per render. A default of `[]` in the signature is a new
// array every time, which broke the `useMemo` below on every keystroke — including
// keystrokes in the Try boxes, which are nowhere near this editor — and reconfigured the
// whole CodeMirror instance for nothing.
const NONE = []

export default function RuleEditor({ value, onChange, onFocus, fields = NONE, maxLength = 1200,
                                     language = 'prose', reads = NONE, verbs = NONE }) {
  const isExpr = language === 'expression'
  const extensions = useMemo(
    () => (isExpr
      ? [expressionPlugin, EditorView.lineWrapping, autocompletion({ override: [expressionCompletionSource(reads, verbs)] }), unknownNameLinter(reads), lengthCap(maxLength), theme, expressionTheme]
      : [highlightPlugin, EditorView.lineWrapping, autocompletion({ override: [fieldCompletionSource(fields)] }), unknownTokenLinter(fields), lengthCap(maxLength), theme]),
    [isExpr, fields, reads, verbs, maxLength]
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
