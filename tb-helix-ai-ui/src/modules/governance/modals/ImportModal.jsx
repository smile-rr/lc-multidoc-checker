import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import { Overlay, sheet } from '@shared/ds/Overlay'

// Import-a-book-from-PDF modal (upload → review-split stages).
export default function ImportModal({ v }) {
  if (!v.importOpen) return null
  return (
    <Overlay onClose={v.closeImport}>
      <div onClick={v.stop} style={{ ...sheet, maxWidth: 560 }}>
        <div style={{ padding: '22px 24px 6px' }}>
          <h2 style={title}>Import a book from PDF</h2>
          <p style={sub}>Upload any rulebook PDF — UCP, ISBP, an internal policy or your own handbook. The assistant reads it, splits it into articles by its own structure, and adds it as a new book.</p>
        </div>

        {v.importUpload && (
          <>
            <div style={{ padding: '16px 24px 4px' }}>
              <div style={{ border: '1.5px dashed var(--me-grey-20)', borderRadius: 12, padding: '36px 20px', textAlign: 'center', background: 'var(--me-grey-08)' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--me-blue-20)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="file-text" size={24} color="var(--me-blue-deep)" /></div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--me-ink)' }}>Drop a PDF here</div>
                <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', margin: '5px 0 0' }}>Any rulebook or reference PDF</div>
              </div>
            </div>
            <div style={footer}>
              <Button variant="ghost" size="md" onClick={v.closeImport}>Cancel</Button>
              <Button variant="primary" size="md" onClick={v.startImport}>Import &amp; split</Button>
            </div>
          </>
        )}

        {v.importReview && (
          <>
            <div style={{ padding: '14px 24px 4px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--me-grey)', marginBottom: 5 }}>Book name</label>
              <input value={v.importName} onChange={v.setImportName} placeholder="e.g. URDG 758 — Demand Guarantees" style={{ width: '100%', height: 42, border: '1px solid var(--me-grey-20)', borderRadius: 10, padding: '0 13px', fontSize: 14, color: 'var(--me-ink)', outline: 'none', marginBottom: 14 }} />
              <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', marginBottom: 12 }}>The assistant split the PDF into these articles. Untick any you don't want.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto' }}>
                {v.importItems.map((it, i) => (
                  <button key={i} onClick={it.onToggle} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 10, cursor: 'pointer' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, background: it.markBg, border: `1.5px solid ${it.markBorder}`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{it.mark}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)', flexShrink: 0 }}>{it.code}</span>
                    <span style={{ fontSize: 13, color: 'var(--me-ink)' }}>{it.title}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={footer}>
              <Button variant="ghost" size="md" onClick={v.closeImport}>Cancel</Button>
              <Button variant="primary" size="md" onClick={v.importBook}>Create book with {v.importCount} articles</Button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  )
}

const title = { fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }
const sub = { fontSize: 13.5, lineHeight: 1.55, color: 'var(--me-grey)', margin: '8px 0 0' }
const footer = { padding: '16px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }

export { title, sub, footer }
