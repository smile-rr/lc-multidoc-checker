import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import Tabs from '@shared/ds/Tabs'
import { OUTCOME } from './ExpressionSimulator'

/**
 * How to write a check — a reference you work from, not a document you read.
 *
 * It used to be the service's grammar string dumped into one 11px `<pre>`: four hundred
 * words, twenty-one verbs and thirty-five field names in a single scroll, with nothing to
 * search and nothing to take away. Everything an author needs was in it, which is exactly
 * why none of it could be found. The two questions actually asked at the keyboard — *what
 * is this field called* and *which verb does that* — were the two furthest down.
 *
 * So the lookups come first and the prose keeps its place at the end. Four tabs in the
 * order they are wanted:
 *
 *   Shape     the table's skeleton, and every check in this catalogue as a worked example
 *   Verbs     the twenty-one, grouped by what they answer
 *   Values    every {DOCUMENT.field}, by document, searchable
 *   Rules     the reasoning — why there is no `not`, why absence is not falsehood
 *
 * NOTHING HERE RESTATES THE LANGUAGE. The verbs, the readable names and the prose all
 * arrive from the service, which is the same source the planner's prompt is built from.
 * The groupings are derived from what each verb was sent with (`returns`, `judgement`), so
 * a verb added to the enum appears here with no edit — a hand-kept list is how the console
 * comes to describe a language the service no longer speaks.
 *
 * Everything is copyable, because the request an author makes of a reference is usually
 * "give me that line". One affordance, learned once: click any mono block or row and it
 * goes to the clipboard.
 */
export default function ExpressionHelp({ onClose, grammar, verbs = [], reads = [], samples = [],
                                         startTab = 'shape' }) {
  // Only the selected tab is mounted, so the render smoke asks for one at a time.
  const [tab, setTab] = useState(startTab)
  const [q, setQ] = useState('')
  const [copied, copy] = useCopy()
  const searchable = tab === 'verbs' || tab === 'values'

  return (
    <div style={{ padding: '2px 4px 8px' }}>
      <div style={head}>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Writing a check</div>
        {/* The whole reference, verbatim — the same text a model writing conditions is
            given. What gets pasted into a ticket is then what the planner reads. */}
        <Copy
          label={copied === 'all' ? 'Copied' : 'Copy all'}
          done={copied === 'all'}
          onClick={() => copy(grammar || '', 'all')}
        />
        {onClose ? (
          <button onClick={onClose} title="Close" style={closeBtn}><Icon name="x" size={15} /></button>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onChange={(id) => { setTab(id); setQ('') }}
        style={{ borderBottom: '1px solid var(--me-grey-15)', margin: '0 0 10px' }}
        items={[
          { id: 'shape', label: 'Shape' },
          { id: 'verbs', label: 'Verbs', badge: <Count n={verbs.length} /> },
          { id: 'values', label: 'Values', badge: <Count n={reads.length} /> },
          { id: 'rules', label: 'Rules' },
        ]}
      />

      {searchable ? (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'verbs' ? 'Find a verb…' : 'Find a field — port, date, amount…'}
          style={search}
        />
      ) : null}

      {tab === 'shape' ? <Shape samples={samples} copied={copied} copy={copy} /> : null}
      {tab === 'verbs' ? <Verbs verbs={verbs} q={q} copied={copied} copy={copy} /> : null}
      {tab === 'values' ? <Values reads={reads} q={q} copied={copied} copy={copy} /> : null}
      {tab === 'rules' ? <Rules grammar={grammar} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shape

const SKELETON = 'WHEN <condition>   THEN "clean"\nWHEN <condition>   THEN "doubt"\nELSE "discrepancy"'

function Shape({ samples, copied, copy }) {
  return (
    <div>
      <p style={lede}>
        The first <b>WHEN</b> whose condition is true decides the check. <b>ELSE</b> is
        required — a table with no fallback answers nothing on the presentation nobody
        thought about.
      </p>

      <Code text={SKELETON} id="skeleton" copied={copied} copy={copy} />

      {/* In the outcomes' own colours — the same three the finding, the review screen and
          the refusal advice use. A fourth palette for the words on the help panel would be
          the panel disagreeing with the product it explains. */}
      <p style={lede}>
        An answer is always one of <Word v="CLEAN">clean</Word> <Word v="DOUBT">doubt</Word>{' '}
        <Word v="DISCREPANT">discrepancy</Word>, quoted. There is no fourth.
      </p>

      {samples.length ? (
        <>
          {/* The examples ARE the catalogue. Nothing is written down twice, so no example
              here can be a check that has since been rewritten — and an author copying one
              is copying something that runs. */}
          <div style={groupHead}>From this catalogue</div>
          {samples.map((s) => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <div style={sampleHead}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.id}</span>
                <span style={{ color: 'var(--me-grey-70)', ...clip }}>{s.title}</span>
                {s.asks ? <span style={asksTag}>asks</span> : null}
              </div>
              <Code text={s.source} id={s.id} copied={copied} copy={copy} />
            </div>
          ))}
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verbs
//
// Three groups, and every one of them derived from what the service sent rather than from
// a list kept here. `judgement` is the distinction that changes how a check is read — those
// four can prove yes and never no — so it leads its own group instead of being a footnote.

const GROUPS = [
  { id: 'test', title: 'Tests', hint: 'answer true or false',
    of: (v) => !v.judgement && v.returns === 'BOOLEAN' },
  { id: 'value', title: 'Values', hint: 'work something out, to be compared',
    of: (v) => v.returns !== 'BOOLEAN' },
  { id: 'judgement', title: 'Judgements', hint: 'prove yes, never no — a false is never reported',
    of: (v) => v.judgement },
]

/** `#same(a, b)` — the shape you type, from the arity you were given. */
const signature = (v) => {
  const args = v.arity < 0 ? 'a, b, …' : ['', 'a', 'a, b', 'a, b, c'][v.arity] ?? 'a, b'
  return `#${v.name}(${args})`
}

function Verbs({ verbs, q, copied, copy }) {
  const hit = match(q)
  const shown = verbs.filter((v) => hit(v.name, v.about))
  if (!shown.length) return <Empty q={q} what="verb" />
  return (
    <div>
      {GROUPS.map((g) => {
        const rows = shown.filter(g.of)
        if (!rows.length) return null
        return (
          <div key={g.id}>
            <div style={groupHead}>{g.title} <span style={groupHint}>{g.hint}</span></div>
            {rows.map((v) => (
              <Row
                key={v.name}
                mono={signature(v)}
                text={v.about}
                copyText={signature(v)}
                id={`v:${v.name}`}
                copied={copied}
                copy={copy}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Values

function Values({ reads, q, copied, copy }) {
  const hit = match(q)
  const shown = reads.filter((r) => hit(r.name, r.label, r.docLabel))
  if (!shown.length) return <Empty q={q} what="field" />
  const byDoc = []
  shown.forEach((r) => {
    const g = byDoc.find((x) => x.doc === r.docLabel)
    if (g) g.rows.push(r)
    else byDoc.push({ doc: r.docLabel, rows: [r] })
  })
  return (
    <div>
      {byDoc.map((g) => (
        <div key={g.doc}>
          <div style={groupHead}>{g.doc}</div>
          {g.rows.map((r) => (
            <Row
              key={r.name}
              mono={`{${r.name}}`}
              text={r.label}
              tag={(r.valueType || '').toLowerCase().replace(/_/g, ' ')}
              copyText={`{${r.name}}`}
              id={`r:${r.name}`}
              copied={copied}
              copy={copy}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rules
//
// The service's own words, typeset rather than rewritten. Where the text indents a block,
// it is showing code and gets a code surface; everything else is prose at a readable
// measure. The verb list at the end is cut — the Verbs tab renders the same data with
// search and copy on it, and the same list twice in one panel is one list too many.

function Rules({ grammar }) {
  const prose = String(grammar || '').split(/^VERBS$/m)[0].trim()
  if (!prose) {
    return <p style={lede}>The language is described by the service, and it could not be reached.</p>
  }
  return (
    <div>
      {prose.split(/\n{2,}/).map((block, i) => (
        /^\s{2,}/.test(block)
          ? <pre key={i} style={{ ...codeBox, cursor: 'default' }}>{dedent(block)}</pre>
          : <p key={i} style={lede}>{block.replace(/\s*\n\s*/g, ' ')}</p>
      ))}
      {/* The text says "the verbs below" because it is written as one page, and it is the
          planner's copy as much as the author's. Rather than rewrite the service's words,
          say where they went. */}
      <p style={{ ...lede, color: 'var(--me-grey-50)', marginBottom: 0 }}>
        The verbs it refers to are on the Verbs tab, with what each one answers.
      </p>
    </div>
  )
}

const dedent = (block) => {
  const lines = block.replace(/\s+$/, '').split('\n')
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length))
  return lines.map((l) => l.slice(pad)).join('\n')
}

// ---------------------------------------------------------------------------
// Copying — one affordance, everywhere
//
// A reference is asked for a line far more often than it is read end to end, so every mono
// thing on this panel is a copy target and says so the same way.

function useCopy() {
  const [key, setKey] = useState(null)
  const copy = (text, k) => {
    try { navigator.clipboard?.writeText(text) } catch (e) { /* no clipboard, no feedback */ }
    setKey(k)
    setTimeout(() => setKey((cur) => (cur === k ? null : cur)), 1400)
  }
  return [key, copy]
}

function Code({ text, id, copied, copy }) {
  const done = copied === id
  return (
    <div style={{ position: 'relative' }}>
      <pre
        onClick={() => copy(text, id)}
        title="Copy"
        style={{ ...codeBox, borderColor: done ? 'var(--me-blue)' : 'var(--me-grey-15)' }}
      >
        {text}
      </pre>
      <span style={{ ...codeMark, color: done ? 'var(--me-blue)' : 'var(--me-grey-50)' }}>
        <Icon name={done ? 'check' : 'copy'} size={12} color="currentColor" />
      </span>
    </div>
  )
}

function Row({ mono, text, tag, copyText, id, copied, copy }) {
  const done = copied === id
  return (
    <button onClick={() => copy(copyText, id)} title="Copy" style={row(done)}>
      <span style={rowMono}>{mono}</span>
      <span style={rowText}>{text}</span>
      {tag ? <span style={typeTag}>{tag}</span> : null}
      <Icon name={done ? 'check' : 'copy'} size={12} color={done ? 'var(--me-blue)' : 'var(--me-grey-20)'} />
    </button>
  )
}

function Copy({ label, done, onClick }) {
  return (
    <button onClick={onClick} style={{ ...copyAll, color: done ? 'var(--me-blue)' : 'var(--me-grey-70)' }}>
      <Icon name={done ? 'check' : 'copy'} size={12} color="currentColor" />
      {label}
    </button>
  )
}

const Count = ({ n }) => <span style={count}>{n}</span>
const Word = ({ v, children }) => {
  const t = OUTCOME[v] || OUTCOME.DOUBT
  return <code style={{ ...word, color: t.ink, background: t.bg, border: `1px solid ${t.border}` }}>{children}</code>
}
const Empty = ({ q, what }) => (
  <div style={{ ...lede, color: 'var(--me-grey-50)' }}>No {what} matches “{q}”.</div>
)

/** Case-folded, matches any of the strings it is handed. */
const match = (q) => {
  const needle = q.trim().toLowerCase()
  return (...parts) => !needle || parts.some((p) => String(p || '').toLowerCase().includes(needle))
}

// ---------------------------------------------------------------------------

const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 8px', position: 'sticky', top: -6, background: '#fff', zIndex: 1 }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 2, marginRight: -2 }
const copyAll = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--me-grey-15)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }
const count = { fontSize: 10, fontWeight: 700, color: 'var(--me-grey-70)', background: 'var(--me-grey-08)', borderRadius: 999, padding: '1px 6px' }
const search = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 12, padding: '5px 9px', borderRadius: 7, border: '1px solid var(--me-grey-20)', background: '#fff', color: 'var(--me-ink)', outline: 'none', marginBottom: 8 }
const lede = { margin: '0 0 10px', padding: '0 2px', fontSize: 12, lineHeight: 1.65, color: 'var(--me-grey)' }
const word = { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '0 5px' }
const codeBox = { margin: '0 0 12px', padding: '9px 32px 9px 11px', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--me-ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', cursor: 'pointer' }
const codeMark = { position: 'absolute', top: 8, right: 9, display: 'flex', pointerEvents: 'none' }
const groupHead = { display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', margin: '12px 0 5px', padding: '0 2px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }
const groupHint = { fontSize: 10.5, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--me-grey-50)' }
const sampleHead = { display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 4px', padding: '0 2px', fontSize: 11.5, minWidth: 0 }
const asksTag = { flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#946400', background: '#FBEFCF', borderRadius: 4, padding: '1px 5px' }
const typeTag = { flexShrink: 0, fontSize: 10, color: 'var(--me-grey-50)' }
const row = (done) => ({
  width: '100%', display: 'flex', alignItems: 'baseline', gap: 9, textAlign: 'left',
  background: done ? 'var(--me-blue-20)' : 'none', border: 'none', borderRadius: 6,
  padding: '3px 7px', cursor: 'pointer', fontFamily: 'inherit',
})
const rowMono = { flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--me-blue-deep)' }
const rowText = { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }
