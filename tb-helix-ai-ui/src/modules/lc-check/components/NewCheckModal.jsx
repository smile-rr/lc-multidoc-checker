import Eyebrow from '@shared/ds/Eyebrow'
import { useEffect, useState } from 'react'
import Modal from '@shared/ds/Modal'
import Button from '@shared/ds/Button'
import Icon from '@shared/ds/Icon'
import { INTAKE_SLOTS } from '../data/fixtures.js'
import * as api from '../api/lcCheckApi'

// Opening a case. Two slots — the credit and the presentation — because the
// credit is what everything else gets measured against, so it goes in first and
// tells us who and what before the officer has typed anything.
//
// Creating a case does not start reading it. This dialog shows filenames and
// what the credit says; the bundle — the thing most likely to be wrong — is not
// visible until Intake. Starting a run from here would commit the spend on the
// strength of a filename, and would make Intake a receipt rather than the last
// free chance to catch the wrong presentation.
export default function NewCheckModal({ open, onClose, onCreated }) {
  const [dropped, setDropped] = useState({})
  const [identity, setIdentity] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) { setDropped({}); setIdentity(null); setCreating(false) }
  }, [open])

  // As soon as the credit lands we read it and show what we found, so the
  // officer can catch a wrong file before committing to a case.
  useEffect(() => {
    if (dropped.credit && !identity) api.peekCredit().then(setIdentity)
  }, [dropped.credit, identity])

  const ready = dropped.credit && dropped.bundle
  const hint = !dropped.credit
    ? 'The credit tells us who and what — add it first.'
    : !dropped.bundle
      ? 'Add the presentation to continue.'
      : 'Both files in.'

  const create = async () => {
    setCreating(true)
    const { caseId } = await api.createCase({ creditFile: INTAKE_SLOTS[0].fileName, bundleFile: INTAKE_SLOTS[1].fileName })
    onCreated(caseId)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Check"
      subtitle="Drop the credit and the presentation. You start the review on the next screen."
      footer={
        <>
          <span style={{ fontSize: 12.5, color: 'var(--me-grey-70)' }}>{hint}</span>
          <Button disabled={!ready || creating} onClick={create}>{creating ? 'Creating…' : 'Create check'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {INTAKE_SLOTS.map((slot) => {
          const done = !!dropped[slot.id]
          return (
            <button
              key={slot.id}
              onClick={() => setDropped((s) => ({ ...s, [slot.id]: true }))}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 10,
                border: `1.5px ${done ? 'solid' : 'dashed'} ${done ? 'var(--me-grey-15)' : 'var(--me-grey-20)'}`,
                background: done ? '#fff' : 'var(--me-grey-08)',
                cursor: 'pointer',
              }}
            >
              <Icon name={slot.icon} size={18} color={done ? 'var(--me-blue)' : 'var(--me-grey-50)'} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <Eyebrow size="sm">{slot.role}</Eyebrow>
                <span style={{ fontSize: 13.5, fontFamily: done ? 'var(--font-mono)' : 'var(--font-sans)', color: done ? 'var(--me-ink)' : 'var(--me-grey-70)' }}>
                  {done ? slot.fileName : 'Drop a file or browse'}
                </span>
              </div>
              {done ? <Icon name="check-circle-2" size={17} color="var(--status-success)" /> : null}
            </button>
          )
        })}
      </div>

      {identity ? (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10, background: 'var(--me-grey-08)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Eyebrow size="sm">Read from the credit</Eyebrow>
          {identity.map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13 }}>
              <span style={{ color: 'var(--me-grey-70)' }}>{row.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--me-ink)', textAlign: 'right' }}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  )
}
