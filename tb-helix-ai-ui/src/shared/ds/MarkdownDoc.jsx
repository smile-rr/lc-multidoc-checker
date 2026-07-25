import { useState, lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Icon from './Icon'

// CodeMirror only loads if someone opens the source view.
const MarkdownSource = lazy(() => import('./MarkdownSource'))

// A markdown document with a rendered view and a source view.
//
// Both halves matter and for different reasons. Models emit markdown, and
// rendered markdown is simply easier to read than a wall of prose — headings,
// lists and tables are what make a finding scannable. But the rendered view is
// an interpretation, and for anything an officer signs their name to they must
// be able to see the exact text that was produced or sent. So: rendered by
// default, source one click away, never one without the other.
export default function MarkdownDoc({
  text,
  label,
  meta,
  defaultView = 'rendered',
  maxHeight,
  actions,
}) {
  const [view, setView] = useState(defaultView)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is permission-gated; the text is on screen either way.
    }
  }

  return (
    <div style={{ border: '1px solid var(--me-grey-20)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px 7px 12px', borderBottom: '1px solid var(--me-grey-15)', background: 'var(--me-grey-08)' }}>
        {label ? (
          <span style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
            {label}
          </span>
        ) : null}
        {meta ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-50)', whiteSpace: 'nowrap' }}>{meta}</span>
        ) : null}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, padding: 2, borderRadius: 999, background: 'var(--me-grey-15)' }}>
          {[
            { id: 'rendered', label: 'View' },
            { id: 'source', label: 'Source' },
          ].map((t) => {
            const on = view === t.id
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: on ? '#fff' : 'transparent',
                  color: on ? 'var(--me-ink)' : 'var(--me-grey)',
                  boxShadow: on ? '0 1px 2px rgba(27,28,30,.12)' : 'none',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {actions}

        <button
          onClick={copy}
          title="Copy markdown"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: copied ? 'var(--status-success)' : 'var(--me-blue)', whiteSpace: 'nowrap' }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div style={{ maxHeight, overflow: maxHeight ? 'auto' : undefined }}>
        {view === 'rendered' ? (
          <div style={{ padding: '4px 18px 16px' }}>
            <Markdown text={text} />
          </div>
        ) : (
          <Suspense fallback={<div style={{ padding: 14, fontSize: 12, color: 'var(--me-grey-70)' }}>Loading source…</div>}>
            <MarkdownSource text={text} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

// Markdown mapped onto the Memara type scale. Kept in one place so a model's
// output cannot introduce styling of its own.
const h = (size, top) => ({
  margin: `${top}px 0 6px`,
  fontSize: size,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1.35,
  color: 'var(--me-ink)',
})

export function Markdown({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => <h1 style={h(17, 18)} {...p} />,
        h2: (p) => <h2 style={h(15, 18)} {...p} />,
        h3: (p) => <h3 style={{ ...h(13, 16), textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, color: 'var(--me-grey-70)' }} {...p} />,
        p: (p) => <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.65, color: 'var(--me-ink)' }} {...p} />,
        ul: (p) => <ul style={{ margin: '0 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }} {...p} />,
        ol: (p) => <ol style={{ margin: '0 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }} {...p} />,
        li: (p) => <li style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--me-ink)' }} {...p} />,
        strong: (p) => <strong style={{ fontWeight: 700, color: 'var(--me-ink)' }} {...p} />,
        em: (p) => <em style={{ fontStyle: 'italic' }} {...p} />,
        a: (p) => <a target="_blank" rel="noreferrer" {...p} />,
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--me-grey-15)', margin: '14px 0' }} />,
        blockquote: (p) => (
          <blockquote style={{ margin: '0 0 10px', padding: '6px 12px', borderLeft: '2px solid var(--me-grey-20)', background: 'var(--me-grey-08)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--me-grey)' }} {...p} />
        ),
        code: ({ inline, ...p }) =>
          inline ? (
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--me-grey-08)', padding: '1px 4px', borderRadius: 3, color: 'var(--me-blue-deep)' }} {...p} />
          ) : (
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7, display: 'block', whiteSpace: 'pre-wrap' }} {...p} />
          ),
        pre: (p) => (
          <pre style={{ margin: '0 0 10px', padding: '10px 12px', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 8, overflow: 'auto' }} {...p} />
        ),
        table: (p) => (
          <div style={{ overflowX: 'auto', margin: '0 0 12px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }} {...p} />
          </div>
        ),
        th: (p) => <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--me-grey-20)', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }} {...p} />,
        td: (p) => <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--me-grey-08)', color: 'var(--me-ink)', verticalAlign: 'top' }} {...p} />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
