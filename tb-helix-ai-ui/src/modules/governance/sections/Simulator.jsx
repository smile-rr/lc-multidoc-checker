import Page from '@shared/ds/Page'
import Eyebrow from '@shared/ds/Eyebrow'
import { cardSurface } from '@shared/ds/Card'
import RuleEditor from '../components/RuleEditor'
import ExpressionSimulator from '../components/ExpressionSimulator'
import { ExpressionHelp } from '../components/ExpressionBody'

/**
 * The expression simulator — a condition, values for what it reads, and what it answers.
 *
 * The card's own "Try it" panel can only run the rule it is attached to. This page makes the
 * condition an input, which is what the two real uses need: working out how to write one
 * before there is a check to hang it on, and reproducing what a stored one did on a
 * presentation that surprised somebody. For the second, the conditions already in the
 * catalogue can be loaded rather than retyped — retyping is how the thing under test stops
 * being the thing that ran.
 *
 * Nothing is judged here. The editor highlights and completes; the service compiles, refuses
 * what is unsafe, checks every name against the dictionary and answers with a row per
 * comparison. Even the help text is the service's own string, the same one a model writing
 * conditions is given.
 */
export default function Simulator({ v }) {
  const s = v.simulator
  return (
    <Page width="detail">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '18px 0 4px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--me-ink)' }}>Expression simulator</div>
          <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', marginTop: 3 }}>
            One table, first match wins. Give the values and see what it reports — leave a
            box empty to say the value was never read.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 18, alignItems: 'start', marginTop: 18 }}>
        <div>
          <div style={{ ...cardSurface, padding: 16 }}>
            <Eyebrow>The check</Eyebrow>
            <div style={{ height: 8 }} />
            <RuleEditor
              value={s.source}
              onChange={s.onChange}
              language="expression"
              reads={s.reads}
              verbs={s.verbs}
              maxLength={1200}
            />

            {s.samples.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--me-grey-50)', marginBottom: 6 }}>
                  Load one that is already in the catalogue
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {s.samples.map((x) => (
                    <button key={x.id} onClick={() => s.onLoad(x.source)} style={chip}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{x.id}</span>
                      <span style={{ color: 'var(--me-grey-70)' }}>{x.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ ...cardSurface, padding: 16, marginTop: 16 }}>
            <Eyebrow>What it reads, and what it answers</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <ExpressionSimulator sim={s.sim} framed={false} />
            </div>
          </div>
        </div>

        <div style={{ ...cardSurface, padding: 10, position: 'sticky', top: 'calc(var(--nav-h, 60px) + 16px)' }}>
          <ExpressionHelp grammar={s.grammar} />
        </div>
      </div>
    </Page>
  )
}

const chip = { display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--me-grey-15)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
