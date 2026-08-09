import Icon from '@shared/ds/Icon'

/**
 * Trying the conditions against values somebody types.
 *
 * The reason this exists: an expression is text, so without it the first time anybody learns
 * what a condition does is on a real presentation. A form-built rule shows its shape as you
 * build it; a line of text shows nothing until it runs.
 *
 * The most useful box is an empty one. A value nobody typed is exactly "not read", which is
 * the state an author never predicts and the one where a careless condition quietly reports
 * a discrepancy that is not there.
 *
 * Nothing here judges anything, and nothing here is styled to look like it might. The service
 * compiles the conditions, walks them, and answers with an outcome per comparison; this puts
 * them on the page. A copy of that judgement in the browser would be a second place for it to
 * be wrong, and the wrong one is the one nobody notices.
 *
 * @param framed the card's collapsible panel. The page owns its own heading and shows the
 *   body outright, because a simulator you have to open is a simulator you have not run.
 */
export default function ExpressionSimulator({ sim, framed = true }) {
  if (!sim.available) return <Unavailable framed={framed} />

  // A table that asks a question is tried against a real case, because a question is about
  // what a document says and only a presentation says anything. Same panel, one Run, one
  // answer — what differs is what it reads and that it costs money.
  const body = sim.asks ? <Agent sim={sim} framed={framed} /> : (
    <div style={{ padding: framed ? '0 0 12px' : 0 }}>
      {sim.reads.length === 0 ? (
        <div style={hint}>Write a check above and the values it reads appear here.</div>
      ) : (
        <div style={grid}>
          {sim.reads.map((r) => <Row key={r.name} r={r} />)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button
          onClick={sim.onRun}
          disabled={sim.busy || sim.reads.length === 0}
          style={runBtn(sim.busy || sim.reads.length === 0)}
        >
          {sim.busy ? 'Running…' : 'Run'}
        </button>
        {!framed && sim.outcome ? <Outcome outcome={sim.outcome} /> : null}
      </div>

      <Problems sim={sim} />

      {sim.decided ? (
        <div style={answer}>
          <code style={reading}>{sim.decided.reading}</code>
          <span style={{ color: 'var(--me-grey-50)' }}>{sim.decided.at}</span>
        </div>
      ) : null}
    </div>
  )

  if (!framed) return body

  return (
    <div style={simWrap}>
      <button onClick={sim.onToggle} style={simHeader}>
        <Icon name={sim.open ? 'chevron-down' : 'chevron-right'} size={13} />
        <span style={{ fontWeight: 600 }}>Try it</span>
        <div style={{ flex: 1 }} />
        {sim.outcome ? <Outcome outcome={sim.outcome} /> : null}
      </button>
      {sim.open ? body : null}
    </div>
  )
}

// Said rather than hidden. Under the fixtures there is no service to compile anything, and a
// simulator that silently draws nothing reads as a broken screen.
function Unavailable({ framed }) {
  return (
    <div style={{ ...(framed ? simWrap : {}), padding: framed ? '9px 0' : 0, fontSize: 11.5, color: 'var(--me-grey-50)' }}>
      Trying a condition needs the service.
    </div>
  )
}

function Problems({ sim }) {
  if (!sim.problems.length) return null
  return <ul style={problems}>{sim.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
}

/**
 * The same panel for a check that asks a question, and three differences that matter.
 *
 * It runs against a **real case**, because a question is about what a document says. It
 * **costs money**, so the button says so and the answer says how much was asked and by which
 * model — an authoring aid that quietly bills is one nobody trusts twice. And it shows the
 * **comparisons the examiner asked for**, which is how an author sees whether their question
 * is doing work or duplicating one they could have written exactly.
 */
function Agent({ sim, framed }) {
  return (
    <div style={{ padding: framed ? '0 0 12px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={sim.caseId} onChange={sim.onCase} style={casePick}>
          <option value="">Choose a case…</option>
          {sim.cases.map((c) => (
            <option key={c.caseId} value={c.caseId}>
              {c.caseId} · {c.beneficiary || c.reference}
            </option>
          ))}
        </select>
        <button
          onClick={sim.onRunAgent}
          disabled={sim.busy || !sim.caseId}
          style={runBtn(sim.busy || !sim.caseId)}
        >
          {sim.busy ? 'Asking…' : 'Run — calls the model'}
        </button>
        {sim.outcome ? <Outcome outcome={sim.outcome} /> : null}
      </div>

      <Problems sim={sim} />

      {sim.asked === 0 ? (
        <div style={hint}>
          Nothing was asked — a comparison settled it before any question was reached, so this
          run cost nothing.
        </div>
      ) : null}

      {sim.conditions.map((c, i) => (
        <div key={i} style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <Outcome outcome={ANSWER[c.answer] || 'DOUBT'} />
            <span style={{ fontSize: 11.5, color: 'var(--me-ink)' }}>{c.ask}</span>
          </div>
          {c.because ? <div style={{ ...hint, paddingLeft: 2 }}>{c.because}</div> : null}
        </div>
      ))}

      {sim.toolCalls.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={hint}>it settled these exactly</div>
          {sim.toolCalls.map((t, i) => (
            <div key={i} style={toolRow}>
              <code style={toolSource}>{String(t.arguments?.condition ?? '')}</code>
              <span style={{ fontSize: 11, color: 'var(--me-grey-70)', flexShrink: 0 }}>
                {String(t.result || '').split(' — ')[0]}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {sim.model ? (
        <div style={{ ...hint, marginTop: 10 }}>
          {sim.exhausted ? 'The budget ran out before an answer — nothing here is a conclusion. ' : ''}
          {sim.asked} condition{sim.asked === 1 ? '' : 's'} asked · {sim.model}
        </div>
      ) : null}
    </div>
  )
}

// What the examiner said about ONE condition, in the same three words as everything else, so
// nothing on the screen has to be translated. It is not what the check reports — that is the
// table's, and it is shown beside the Run button.
const ANSWER = { TRUE: 'DISCREPANT', FALSE: 'CLEAN', UNKNOWN: 'DOUBT' }

function Row({ r }) {
  return (
    <>
      <label style={nameLabel} title={r.label || r.name}>{r.name}</label>
      <input
        className="inline-edit"
        value={r.value}
        onChange={r.onChange}
        placeholder={r.hint}
        style={valueInput}
      />
    </>
  )
}

/**
 * The result, in the examination's own three words and no others.
 *
 * `Clean`, `Doubt`, `Discrepancy` — the same three the plan, the finding, the review screen,
 * the database and the refusal advice use. There is no held / did not hold layer on top of
 * them: that made a reader translate a boolean into an outcome, and a translation is a place
 * to be wrong. What the check reports IS what is shown.
 *
 * Every value here is computed by the service. A condition carries its own grade, so what a
 * failure means is authored rather than inferred, and the browser only renders it.
 */
export function Outcome({ outcome }) {
  const tone = OUTCOME[outcome] || OUTCOME.DOUBT
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: tone.ink, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 5, padding: '0 6px', flexShrink: 0 }}>
      {tone.label}
    </span>
  )
}

export const OUTCOME = {
  CLEAN: { border: 'var(--me-grey-15)', bg: '#fff', ink: '#1a7a32', label: 'Clean' },
  DISCREPANT: { border: 'var(--status-error)', bg: '#FBE3E1', ink: 'var(--status-error)', label: 'Discrepancy' },
  DOUBT: { border: '#E9C97A', bg: '#FBEFCF', ink: '#946400', label: 'Doubt' },
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const grid = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: '5px 10px', alignItems: 'center' }
const nameLabel = { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-blue-deep)', ...ellipsis }
const valueInput = { fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%', border: '1px solid var(--me-grey-15)', borderRadius: 6, padding: '3px 7px', background: '#fff' }
const simWrap = { marginTop: 12, borderTop: '1px solid var(--me-grey-15)' }
const simHeader = { width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--me-ink)', textAlign: 'left' }
const hint = { fontSize: 11.5, color: 'var(--me-grey-50)', padding: '4px 0' }
const reading = { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-ink)', overflowWrap: 'anywhere' }
const answer = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10, fontSize: 11 }
const casePick = { fontFamily: 'inherit', fontSize: 12, padding: '4px 7px', borderRadius: 7, border: '1px solid var(--me-grey-20)', background: '#fff', cursor: 'pointer', maxWidth: 250 }
const toolRow = { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }
const toolSource = { flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-ink)', overflowWrap: 'anywhere' }
const problems = { margin: '9px 0 0', paddingLeft: 18, fontSize: 11.5, color: 'var(--status-error)', lineHeight: 1.6 }
const runBtn = (disabled) => ({ fontSize: 12, fontWeight: 600, padding: '4px 14px', borderRadius: 7, border: '1px solid var(--me-grey-20)', background: disabled ? 'var(--me-grey-08)' : '#fff', color: disabled ? 'var(--me-grey-50)' : 'var(--me-ink)', cursor: disabled ? 'default' : 'pointer' })
