import { cardSurface } from '@shared/ds/Card'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Badge from '@shared/ds/Badge'
import { Overlay } from '@shared/ds/Overlay'

// Agent "Test run" modal — phase-by-phase execution + a checker's memo.
export default function TestRunModal({ v }) {
  if (!v.testOpen) return null
  return (
    <Overlay onClose={v.closeTest} pad="40px 20px">
      <div onClick={v.stop} style={{ width: '100%', maxWidth: 720, background: 'var(--me-grey-08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(27,28,30,.35)' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid var(--me-grey-15)', padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Eyebrow as="div" color="var(--me-blue)">Test run</Eyebrow>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 3 }}>{v.agentName}</div>
            <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>Sample presentation · MT700 LC-2026-0453</div>
          </div>
          <button onClick={v.closeTest} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="x" size={20} color="var(--me-grey-70)" /></button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Eyebrow as="div">Phase-by-phase execution</Eyebrow>
          {v.phases.map((ph, i) => (
            <div key={i} style={{ ...cardSurface(12), boxShadow: 'none', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Eyebrow size="sm">{ph.n}</Eyebrow>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--me-ink)' }}>{ph.title}</span>
              </div>
              {ph.detail && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-grey)' }}>{ph.detail}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ph.scenarios.map((rr, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingTop: 8, borderTop: '1px solid var(--me-grey-08)' }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: rr.markBg, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, marginTop: 1 }}>{rr.mark}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-grey)' }}>{rr.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Eyebrow as="div" style={{ marginTop: 4 }}>Checker&rsquo;s memo</Eyebrow>
          <div style={{ ...cardSurface(12), boxShadow: 'none', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--me-grey-15)', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--me-ink)' }}>LC-2026-0453</span>
              <Badge tone="error">2 discrepancies</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--me-grey)' }}>
              <div><strong style={{ color: 'var(--status-error)' }}>1. Critical — Availability / place of expiry.</strong> The credit is available with any bank, yet expiry is stated in London while shipment and presentation occur in Singapore. <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>(AVAIL-41A · UCP 600 art. 6)</span></div>
              <div><strong style={{ color: '#946400' }}>2. Major — Expiry buffer.</strong> Presentation location is cross-border from the beneficiary and the expiry date leaves no courier buffer — operational risk of a late presentation. <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>(DATE-31D · UCP 600 art. 6(d))</span></div>
              <div style={{ color: 'var(--me-grey-70)' }}>All other conditions across three groups passed. <strong style={{ color: 'var(--me-ink)' }}>Recommendation:</strong> raise the availability discrepancy and warn on the buffer.</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid var(--me-grey-15)', padding: '14px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" size="md" onClick={v.closeTest}>Close</Button>
          <Button variant="secondary" size="md">Export memo</Button>
        </div>
      </div>
    </Overlay>
  )
}

