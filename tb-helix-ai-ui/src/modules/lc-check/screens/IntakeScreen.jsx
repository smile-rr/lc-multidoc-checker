import { ellipsis } from '@shared/ds/text'
import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import PageStrip from '@shared/ds/PageStrip'
import DocumentSurface, { usePageBar } from '@shared/ds/DocumentSurface'
import BundleViewer from '../components/BundleViewer'
import Mt700TextViewer from '../components/Mt700TextViewer'
import { INTAKE_SLOTS } from '../data/fixtures.js'
import { PANE_FILL } from '../components/paneHeight'
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
//
// This screen is the first thing shown after a case is created, and at that moment
// the credit is still being read — so every field it draws has to be optional. It
// was not, and the missing credit document took the whole workbench down to a
// blank page: the officer pressed Create and got nothing, with no way to tell a
// crash from a slow read.
export default function IntakeScreen() {
  const { data, run } = useCase()
  const [slot, setSlot] = useState('credit')
  const [page, setPage] = useState(1)
  const { pageBarVisible, togglePageBar } = usePageBar()

  const credit = data.documents.find((d) => d.role === 'credit')
  const creditLines = credit?.lines ?? []
  const isCredit = slot === 'credit'
  const total = data.totalPages ?? 0
  const pending = run.busy

  const fieldCount = creditLines.filter((l) => l.tag).length
  const slots = [
    {
      ...INTAKE_SLOTS[0],
      fileName: credit?.fileName ?? 'Waiting for the credit',
      meta: fieldCount ? `${credit?.docType ?? 'MT700'} · ${fieldCount} fields` : 'Reading…',
      ready: fieldCount > 0,
    },
    {
      ...INTAKE_SLOTS[1],
      fileName: data.pdfUrl?.split('/').pop() ?? 'bundle.pdf',
      meta: total ? `${total} pages · one scan` : 'Preparing…',
      ready: total > 0,
    },
  ]

  return (
    <section className="helix-screen" style={{ padding: '16px 24px 16px', ...PANE_FILL, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, ...PANE_FILL }}>
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
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: on ? 'var(--me-blue-deep)' : 'var(--me-ink)', ...ellipsis }}>
                    {s.role}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-70)', ...ellipsis }}>
                    {s.fileName}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--me-grey-70)', ...ellipsis }}>{s.meta}</span>
                </div>
                {s.ready ? (
                  <Icon name="check-circle-2" size={15} color="var(--status-success)" />
                ) : (
                  <Spinner />
                )}
              </button>
            )
          })}

          {/* Status only — no replace/DocEx control. That dashed tile looked like
              a button and did nothing; DocEx is not wired, and replacing a file
              mid-case is not a supported path. The two slots above are the files. */}
          {run.failure ? (
            <p style={{ margin: 0, padding: '0 2px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--status-error)' }}>
              Reading stopped — {run.failure}. The files are stored; rerun intake to try again.
            </p>
          ) : pending ? (
            <p style={{ margin: 0, padding: '0 2px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>
              {run.activity ?? 'Reading what came in'}… Nothing examined yet.
            </p>
          ) : (
            <p style={{ margin: 0, padding: '0 2px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--me-grey-70)' }}>
              Confirm both files, then start the review above.
            </p>
          )}
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', ...ellipsis }}>
                  {isCredit ? slots[0].fileName : slots[1].fileName}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>
                  {isCredit ? 'text message' : 'not yet split'}
                </span>
              </>
            }
            toolbar={isCredit || !total ? null : <PageStrip pages={total} activePage={page} onPage={setPage} />}
          >
            {isCredit ? (
              creditLines.length ? (
                <Mt700TextViewer lines={creditLines} fileName={slots[0].fileName} />
              ) : (
                <Waiting label={run.activity ?? 'Reading the credit'} />
              )
            ) : total ? (
              <BundleViewer pdfUrl={data.pdfUrl} page={page} onPageChange={setPage} />
            ) : (
              <Waiting label={run.activity ?? 'Preparing the presentation'} />
            )}
          </DocumentSurface>
        </div>
      </div>
    </section>
  )
}

// A file slot that has not filled in yet. Turning, so it reads as work rather
// than as a control that failed to render.
function Spinner() {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: '50%',
        border: '2px solid var(--me-grey-15)',
        borderTopColor: 'var(--me-blue)',
        animation: 'helix-spin .8s linear infinite',
        flex: '0 0 auto',
      }}
    />
  )
}

// The reading column while there is nothing to read. It says what is happening
// and keeps the column exactly where it will be when the document lands, so the
// page does not jump when it does.
function Waiting({ label }) {
  return (
    <div style={{ height: '100%', minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--me-grey-70)' }}>
      <Spinner />
      <span style={{ fontSize: 12.5 }}>{label}…</span>
    </div>
  )
}
