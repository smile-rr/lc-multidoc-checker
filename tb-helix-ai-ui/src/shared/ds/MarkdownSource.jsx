import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'

// The source half of MarkdownDoc: the exact text, read-only, in the same editor
// the Governance module authors rules in. Split into its own module so the
// CodeMirror bundle only loads when someone actually switches to it.
const theme = EditorView.theme({
  '&': { fontSize: '11.5px', background: 'transparent' },
  '&.cm-editor': { border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: "'Roboto Mono', ui-monospace, monospace", padding: '12px 14px', lineHeight: '1.7' },
  '.cm-scroller': { fontFamily: "'Roboto Mono', ui-monospace, monospace", lineHeight: '1.7' },
  '.cm-gutters': { background: 'var(--me-grey-08)', border: 'none', color: 'var(--me-grey-50)' },
  '.cm-activeLine': { background: 'transparent' },
  '.cm-activeLineGutter': { background: 'transparent' },
})

export default function MarkdownSource({ text }) {
  return (
    <CodeMirror
      value={text}
      editable={false}
      extensions={[markdown(), EditorView.lineWrapping, theme]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        highlightSelectionMatches: false,
        searchKeymap: false,
        drawSelection: false,
      }}
    />
  )
}
