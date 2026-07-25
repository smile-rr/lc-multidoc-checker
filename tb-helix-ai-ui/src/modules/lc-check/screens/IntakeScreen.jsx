import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import PageStrip from '@shared/ds/PageStrip'
import DocumentSurface, { DOC_VIEWPORT_HEIGHT, usePageBar } from '@shared/ds/DocumentSurface'
import BundleViewer from '../components/BundleViewer'
import Mt700TextViewer from '../components/Mt700TextViewer'
import { INTAKE_SLOTS } from '../data/fixtures.js'
import { useCase } from '../state/CaseContext'

// Stage 1 — what came in.
//
// The two files exactly as received, before anything is interpreted: the credit
// as its raw SWIFT message, the presentation as the scan itself. Nothing here is
// a conclusion. It exists so a wrong or incomplete presentation is caught now,
// rather than after a run has spent twenty seconds reading the wrong bundle.
//
// Both render inside the same DocumentSurface as the Interpret stage, so switching
// file — or stage — never resizes the reading column.
export default function IntakeScreen() {
  const { data } = useCase()
  const [slot, setSlot] = useState('credit')
  const [page, setPage] = useState(1)
  const { pageBarVisible, togglePageBar } = usePageBar()

  const credit = data.documents.find((d) => d.role === 'credit')
  const isCredit = slot === 'credit'
  const total = data.totalPages

  const slots = [
    { ...INTAKE_SLOTS[0], fileName: credit.fileName, meta: `MT700 · ${credit.lines.filter((l) => l.tag).length} fields` },
    { ...INTAKE_SLOTS[1], fileName: data.pdfUrl.split('/').pop(), meta: `${total} pages · one scan` },
  ]

  return (
    <section className="helix-screen" style={{ padding: '16px 24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, height: DOC_VIEWPORT_HEIGHT }}>
        <div style={{ width: 240, flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          {slots.map((s) => {
            const on = slot === s.id
            return (
              <button
                key={s.id}
                onClick={() => { setSlot(s.id); setPage(1) }}
                style={{
                  background: '#fff',
                  border: `1px solid ${on ? 'var(--me-blue)' : 'var(--me-grey-15)'}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: on ? '0 4px 16px rgba(4,115,234,.12)' : '0 1px 3px rgba(27,28,30,.05)',
                }}
              >
                <Icon name={s.icon} size={15} color={on ? 'var(--me-blue)' : 'var(--me-grey-70)'} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: on ? 'var(--me-blue-deep)' : 'var(--me-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.role}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.fileName}
                  </span>
                </div>
                <Icon name="check-circle-2" size={15} color="var(--status-success)" />
              </button>
            )
          })}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, border: '1px dashed var(--me-grey-20)', borderRadius: 10, color: 'var(--me-grey-70)', fontSize: 12, background: '#fff', textAlign: 'center', lineHeight: 1.4 }}>
            <Icon name="plus" size={14} />
            <span>Replace a file, or pull from DocEx</span>
          </div>

          <p style={{ margin: 0, padding: '0 2px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>
            Nothing has been read yet, and nothing has been spent. Check both files
            are the right ones, then start the review from the button above — the
            presentation is split into documents at that point, not before.
          </p>
        </div>

        <div style={{ flex: 1, minWidth: 0, maxWidth: 1040 }}>
          <DocumentSurface
            pageBarVisible={pageBarVisible}
            onTogglePageBar={togglePageBar}
            header={
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>
                  {isCredit ? 'Letter of Credit' : 'Presented Documents'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isCredit ? credit.fileName : slots[1].fileName}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
                  {isCredit ? 'text message' : 'not yet split'}
                </span>
              </>
            }
            toolbar={isCredit ? null : <PageStrip pages={total} activePage={page} onPage={setPage} />}
          >
            {isCredit ? (
              <Mt700TextViewer lines={credit.lines} fileName={credit.fileName} />
            ) : (
              <BundleViewer pdfUrl={data.pdfUrl} page={page} onPageChange={setPage} />
            )}
          </DocumentSurface>
        </div>
      </div>
    </section>
  )
}
