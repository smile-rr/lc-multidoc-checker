import Eyebrow from '@shared/ds/Eyebrow'
import { useEffect, useRef, useState } from 'react'
import Modal from '@shared/ds/Modal'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import { isMock } from '@shared/lib/dataSource.js'
import { INTAKE_SLOTS } from '../data/fixtures.js'
import * as api from '../api/lcCheckApi'

// Opening a case. Two slots — the credit and the presentation — because the
// credit is what everything else gets measured against, so it goes in first and
// tells us who and what before the officer has typed anything.
//
// Creating a case does not examine it. This dialog shows filenames and what the
// credit says on its face; the bundle — the thing most likely to be wrong — is
// not visible until Intake. Starting a run from here would commit the spend on
// the strength of a filename, and would make Intake a receipt rather than the
// last free chance to catch the wrong presentation.
//
// The glance at the credit is deliberately shallow: the tags as written, straight
// off the message. It comes back instantly because no model is involved, and it
// answers the only question this dialog asks — is this the right file. What the
// credit *means* is read in Intake, where it can report itself as it goes.

const ACCEPT = {
  credit: '.txt,.swift,text/plain',
  bundle: '.pdf,.tif,.tiff,application/pdf,image/tiff',
}

// The fixtures name the files a demo would have dropped. In mock there is no
// file to pick, so the dialog behaves as it always has — click a slot, it fills.
const DEMO = Object.fromEntries(INTAKE_SLOTS.map((s) => [s.id, { name: s.fileName, size: null }]))

const sizeOf = (file) => (file.size == null ? null : `${Math.max(1, Math.round(file.size / 1024))} KB`)

export default function NewCheckModal({ open, onClose, onCreated }) {
  const [files, setFiles] = useState({})
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState(null)
  const inputs = useRef({})

  useEffect(() => {
    if (!open) { setFiles({}); setCreating(false); setFailed(null) }
  }, [open])

  // The credit used to be read here, on drop, to show what was in it before
  // committing to a case. It was a model call inside a dialog: five seconds of a
  // modal that could not be dismissed, over a file that intake reads again a
  // moment later. The preview was worth something — you could catch the wrong
  // file — but not at the price of holding somebody in a box while a model
  // thinks.
  //
  // So the credit is read once, by intake, after the case exists. The case is in
  // the list immediately and identifies itself when the reading lands. Catching
  // the wrong file moves to where it costs nothing: the case says which file it
  // came from, and a case created by mistake is deleted rather than waited out.

  const put = (slotId, file) => {
    setFiles((s) => ({ ...s, [slotId]: { name: file.name, size: sizeOf(file), file } }))
    setFailed(null)
  }

  const choose = (slotId) => {
    if (isMock) {
      setFiles((s) => ({ ...s, [slotId]: DEMO[slotId] }))
      return
    }
    inputs.current[slotId]?.click()
  }

  const ready = files.credit && files.bundle
  const hint = failed
    ? failed
    : !files.credit
      ? 'The credit tells us who and what — add it first.'
      : !files.bundle
        ? 'Add the presentation to continue.'
        : 'Both files in.'

  // Create returns as soon as the uploads are stored — the reading happens on the
  // workbench, in the open, where it can be watched. So this waits on a write and
  // a row, not on a model.
  const create = async () => {
    setCreating(true)
    setFailed(null)
    try {
      const { caseId } = await api.createCase({
        creditFile: files.credit?.file ?? files.credit?.name,
        bundleFile: files.bundle?.file ?? files.bundle?.name,
      })
      onCreated(caseId)
    } catch (error) {
      // Kept on the dialog rather than navigating to a case that does not exist.
      setCreating(false)
      setFailed(error.message ?? 'Could not open the case.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Check"
      subtitle="Drop the credit and the presentation. You start the review on the next screen."
      footer={
        <>
          <span style={{ fontSize: 12.5, color: failed ? 'var(--status-error)' : 'var(--me-grey-70)' }}>{hint}</span>
          <Button disabled={!ready || creating} onClick={create}>{creating ? 'Opening…' : 'Create check'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {INTAKE_SLOTS.map((slot) => {
          const held = files[slot.id]
          return (
            <div key={slot.id}>
              <input
                ref={(el) => { inputs.current[slot.id] = el }}
                type="file"
                accept={ACCEPT[slot.id]}
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) put(slot.id, f); e.target.value = '' }}
              />
              <button
                onClick={() => choose(slot.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) put(slot.id, f)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1.5px ${held ? 'solid' : 'dashed'} ${held ? 'var(--me-grey-15)' : 'var(--me-grey-20)'}`,
                  background: held ? '#fff' : 'var(--me-grey-08)',
                  cursor: 'pointer',
                }}
              >
                <Icon name={slot.icon} size={18} color={held ? 'var(--me-blue)' : 'var(--me-grey-50)'} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <Eyebrow size="sm">{slot.role}</Eyebrow>
                  <span style={{ fontSize: 13.5, fontFamily: held ? 'var(--font-mono)' : 'var(--font-sans)', color: held ? 'var(--me-ink)' : 'var(--me-grey-70)' }}>
                    {held ? `${held.name}${held.size ? ` · ${held.size}` : ''}` : 'Drop a file or browse'}
                  </span>
                </div>
                {held ? <Icon name="check-circle-2" size={17} color="var(--status-success)" /> : null}
              </button>
            </div>
          )
        })}
      </div>

      {ready ? (
        <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, background: 'var(--me-grey-08)', fontSize: 12.5, color: 'var(--me-grey-70)', lineHeight: 1.5 }}>
          The credit is read once the case is created — it appears in the list straight
          away and fills in its own reference, amount and parties when the reading lands.
        </div>
      ) : null}
    </Modal>
  )
}
