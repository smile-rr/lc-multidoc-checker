import Icon from '../ds/Icon'
import Button from '../ds/Button'
import { Overlay, sheet } from './Overlay'
import { title, sub, footer } from './ImportModal'

// Import checks — upload or paste rules, past discrepancies or a case, and the
// assistant proposes checks for you to confirm.
export default function AddCaseModal({ v }) {
  if (!v.addOpen) return null
  return (
    <Overlay onClose={v.closeAdd}>
      <div onClick={v.stop} style={{ ...sheet, maxWidth: 560 }}>
        <div style={{ padding: '22px 24px 6px' }}>
          <h2 style={title}>Import checks with the assistant</h2>
          <p style={sub}>Upload a rules document, a past-discrepancy log or a spreadsheet — or just paste what you saw. The assistant reads it and proposes checks for you to confirm. No need to decide where they go.</p>
        </div>
        <div style={{ padding: '16px 24px 4px' }}>
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} />
            <div style={{ border: '1.5px dashed var(--me-grey-20)', borderRadius: 12, padding: '22px 20px', textAlign: 'center', background: 'var(--me-grey-08)', marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--me-blue-20)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Icon name="upload" size={20} color="var(--me-blue-deep)" /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--me-ink)' }}>Drop a file here, or click to upload</div>
              <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', marginTop: 4 }}>Rules doc, discrepancy log, PDF or spreadsheet</div>
            </div>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--me-grey-15)' }} />
            <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>or paste it</span>
            <span style={{ flex: 1, height: 1, background: 'var(--me-grey-15)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: 999, padding: '5px 12px' }}>A discrepancy I saw</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--me-grey-70)', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 999, padding: '5px 12px' }}>A rule to enforce</span>
          </div>
          <textarea placeholder="e.g. The bill of lading was dated after the latest shipment date and we raised a discrepancy — the applicant later waived it." style={{ width: '100%', minHeight: 110, border: '1px solid var(--me-grey-20)', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--me-ink)', resize: 'vertical', outline: 'none' }} />
          <div style={{ fontSize: 12, color: 'var(--me-grey-70)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="clock" size={14} color="var(--me-grey-70)" />Processed in the background — you'll review the proposed checks before anything changes.
          </div>
        </div>
        <div style={footer}>
          <Button variant="ghost" size="md" onClick={v.closeAdd}>Cancel</Button>
          <Button variant="primary" size="md" onClick={v.closeAdd}>Propose checks</Button>
        </div>
      </div>
    </Overlay>
  )
}
