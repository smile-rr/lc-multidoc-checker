import { useState } from 'react'
import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Page from '@shared/ds/Page'
import TextArea from '@shared/ds/TextArea'
import DetailBack from '@shared/ds/DetailBack'
import Toolbar from '@shared/ds/Toolbar'
import SearchBar from '@shared/ds/SearchBar'
import ViewSwitch from '@shared/ds/ViewSwitch'
import Card from '@shared/ds/Card'
import Chip from '@shared/ds/Chip'
import Eyebrow from '@shared/ds/Eyebrow'
import SortHeader from '@shared/ds/SortHeader'
import IconButton from '@shared/ds/IconButton'
import { Menu, MenuItem, MenuEmpty } from '@shared/ds/Menu'
import { ellipsis, clampLines } from '@shared/ds/text'
import { listWrap, listHead, listRow } from '@shared/ds/listStyles'
import { useNewItemFocus } from '@shared/lib/useNewItemFocus'
import PendingNotice from '../components/PendingNotice'

// Dictionary — the shared vocabulary of fields and document types.
//
// A field is a plain business name, not a tag of the credit: nothing here is
// reserved to the LC. Name the field, then list the documents it can be read
// from; each source carries one note saying what it is called there and how to
// read it. That note is the whole extraction instruction — the credit is just
// one more document a field is bound to.
export default function Dictionary({ v }) {
  // Item detail — a single editable card with a back link (like other sections).
  if (v.isDictDetail) {
    const d = v.dictDetail
    return (
      <Page width="detail">
        <DetailBack label="Back to dictionary" onBack={d.onBack} />
        <div style={{ maxWidth: 860 }}>
          {d.kind === 'field' ? <FieldCard f={d.row} defaultOpen /> : <DocCard d={d.row} />}
        </div>
      </Page>
    )
  }

  return (
    <Page width="detail">
      <Toolbar
        left={
          <>
            <div style={{ display: 'flex', border: '1px solid var(--me-grey-20)', borderRadius: 9, overflow: 'hidden', width: 'fit-content' }}>
              <button onClick={v.setDictFieldsTab} style={{ ...tab, background: v.dictFieldsBg, color: v.dictFieldsFg }}>Fields</button>
              <button onClick={v.setDictDocsTab} style={{ ...tab, borderLeft: '1px solid var(--me-grey-20)', background: v.dictDocsBg, color: v.dictDocsFg }}>Document types</button>
            </div>
            <SearchBar value={v.dictSearch} onChange={v.setDictSearch} placeholder="Search the dictionary…" width={280} />
            <span style={{ fontSize: 12.5, color: 'var(--me-grey-70)', whiteSpace: 'nowrap' }}>{v.dictCountLabel}</span>
          </>
        }
        right={
          <>
            <PendingNotice pending={v.pending} />
            {v.dictIsFields ? (
              <Button variant="primary" size="md" onClick={v.addField} disabled={v.addBlocked}>New field</Button>
            ) : (
              <Button variant="primary" size="md" onClick={v.addDoc} disabled={v.addBlocked}>New document type</Button>
            )}
            <ViewSwitch isList={v.dictIsListView} onList={v.setDictListView} onCards={v.setDictCards} />
          </>
        }
      />

      {/* ---- Fields ---- */}
      {v.dictIsFields && v.dictIsListView && (
        <div style={listWrap}>
          <div style={{ ...fieldGrid, ...listHead }}>
            <SortHeader label="Field" {...v.dictSortCol('name')} />
            <SortHeader label="Description" {...v.dictSortCol('description')} />
            <SortHeader label="Read from" {...v.dictSortCol('sources')} />
            <SortHeader label="Used by" {...v.dictSortCol('used')} />
            <span />
          </div>
          {v.fieldRows.map((f) => (
            <div key={f.id} onClick={f.onOpen} style={{ ...fieldGrid, ...listRow, cursor: 'pointer' }}>
              <span style={ellip(13.5, 600, 'var(--me-ink)')}>{f.name}</span>
              <span style={ellip(12.5, 400, 'var(--me-grey)')}>{f.description || '—'}</span>
              <span style={ellip(12, 400, 'var(--me-grey-70)')}>{f.docsLine}</span>
              <span style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{f.usedLabel}</span>
              <Icon name="chevron-right" size={16} color="var(--me-grey-50)" />
            </div>
          ))}
        </div>
      )}

      {v.dictIsFields && v.dictIsCards && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {v.fieldRows.map((f) => <FieldCard key={f.id} f={f} />)}
        </div>
      )}

      {/* ---- Document types ---- */}
      {v.dictIsDocs && v.dictIsListView && (
        <div style={listWrap}>
          <div style={{ ...docGrid, ...listHead }}>
            <SortHeader label="Key" {...v.dictSortCol('key')} />
            <SortHeader label="Name" {...v.dictSortCol('name')} />
            <SortHeader label="Description" {...v.dictSortCol('description')} />
            <SortHeader label="Used by" {...v.dictSortCol('used')} />
            <span />
          </div>
          {v.docRows.map((d) => (
            <div key={d.id} onClick={d.onOpen} style={{ ...docGrid, ...listRow, cursor: 'pointer' }}>
              <span style={ellip(12, 600, 'var(--me-blue-deep)', 'var(--font-mono)')}>{d.key || '—'}</span>
              <span style={ellip(13.5, 500, 'var(--me-ink)')}>{d.name}</span>
              <span style={clamp(12, 400, 'var(--me-grey-70)', 2)}>{d.description || '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{d.usedLabel}</span>
              <Icon name="chevron-right" size={16} color="var(--me-grey-50)" />
            </div>
          ))}
        </div>
      )}

      {v.dictIsDocs && v.dictIsCards && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {v.docRows.map((d) => <DocCard key={d.id} d={d} />)}
        </div>
      )}
    </Page>
  )
}

// A field, with its sources folded away.
//
// A field can be read from half a dozen documents, and each source carries a
// note long enough to be an instruction. Printed in full, twenty-two of these
// is a scroll nobody reads. So a card rests at three lines — name, description,
// and the documents as chips — and opens to the notes when you go to work on
// it. The chips carry the same information the list view's "Read from" column
// does, which is what you need to answer "where does this come from" without
// opening anything.
function FieldCard({ f, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen || f.isNew)
  const nameRef = useNewItemFocus(f.isNew)
  const n = f.bindings.length
  return (
    <Card pad="sm" data-item-id={f.id} style={f.isNew ? newCard : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input ref={nameRef} className="inline-edit" value={f.name} onChange={f.onChangeName} onFocus={f.onFocus} readOnly={f.locked} placeholder="Business field name" style={nameInput} />
        <Chip size="sm" title="Checks that read this field" style={{ flexShrink: 0, fontWeight: 600, color: 'var(--me-grey-70)' }}>{f.usedLabel}</Chip>
        <IconButton icon="trash-2" title={f.removeTip} tone="danger" onClick={f.onRemove} />
      </div>
      <TextArea className="inline-edit" value={f.description} onChange={f.onChangeDesc} onFocus={f.onFocus} readOnly={f.locked} placeholder="What this field holds, in one line…" maxLines={3} maxLength={DESC_MAX} style={descArea} />

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setOpen((o) => !o)} style={disclosure}>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
            <Eyebrow size="sm">Read from</Eyebrow>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--me-grey-70)' }}>{n === 0 ? 'no source yet' : n === 1 ? '1 document' : `${n} documents`}</span>
          </button>
          {!open && f.bindings.map((b, i) => (
            <Chip key={i} size="sm" title={b.note || 'No read note yet'}>{b.doc}</Chip>
          ))}
          {!open && n === 0 && <span style={{ fontSize: 12, color: 'var(--me-grey-50)' }}>A check cannot read this field until it has one.</span>}
        </div>

        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {f.bindings.map((b, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '176px minmax(0,1fr) 24px', gap: 10, alignItems: 'start' }}>
                <span title={b.doc} style={{ ...ellip(12.5, 600, 'var(--me-ink)'), paddingTop: 7 }}>{b.doc}</span>
                <TextArea
                  className="inline-edit"
                  value={b.note}
                  onChange={b.onChangeNote}
                  onFocus={f.onFocus}
                  readOnly={f.locked}
                  placeholder="What it is called here and how to read it…"
                  maxLines={3}
                  maxLength={NOTE_MAX}
                  style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, color: 'var(--me-grey)', padding: '5px 7px' }}
                />
                <IconButton icon="x" size="sm" tone="danger" title="Remove this source" onClick={b.onRemove} style={{ justifySelf: 'end', marginTop: 3 }} />
              </div>
            ))}
            {!n && <span style={{ fontSize: 12, color: 'var(--me-grey-50)' }}>No source yet — a check cannot read this field until it has one.</span>}
            <span style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Menu
                open={f.pickerOpen}
                onClose={f.onTogglePicker}
                width={250}
                maxHeight={250}
                trigger={<Chip dashed onClick={f.onTogglePicker}>+ Document it appears on</Chip>}
              >
                {f.docBook.map((db, i) => <MenuItem key={i} label={db.name} onClick={db.onAdd} />)}
                {!f.docBook.length && <MenuEmpty>Every document type is already a source for this field.</MenuEmpty>}
              </Menu>
            </span>
          </div>
        )}
      </div>
      {f.editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)' }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={f.onCancel}
            title={f.isNew ? 'Discard this — it has not been added yet' : 'Undo the changes made since you started editing'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: f.isNew ? 'var(--status-error)' : 'var(--me-grey-70)' }}
          >
            {f.cancelLabel}
          </button>
          <Button variant="primary" size="sm" onClick={f.onSave}>Save</Button>
        </div>
      )}
    </Card>
  )
}

function DocCard({ d }) {
  const nameRef = useNewItemFocus(d.isNew)
  return (
    <Card pad="sm" data-item-id={d.id} style={d.isNew ? newCard : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="inline-edit" value={d.key} onChange={d.onChangeKey} onFocus={d.onFocus} readOnly={d.locked} placeholder="KEY" style={{ width: 180, flexShrink: 0, padding: '6px 9px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }} />
        <input ref={nameRef} className="inline-edit" value={d.name} onChange={d.onChangeName} onFocus={d.onFocus} readOnly={d.locked} placeholder="Document name" style={nameInput} />
        <IconButton icon="trash-2" title={d.removeTip} tone="danger" onClick={d.onRemove} />
      </div>
      <TextArea className="inline-edit" value={d.description} onChange={d.onChangeDesc} onFocus={d.onFocus} readOnly={d.locked} placeholder="Short description of this document type…" maxLines={3} maxLength={DESC_MAX} style={descArea} />
      {d.editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--me-grey-08)' }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={d.onCancel}
            title={d.isNew ? 'Discard this — it has not been added yet' : 'Undo the changes made since you started editing'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: d.isNew ? 'var(--status-error)' : 'var(--me-grey-70)' }}
          >
            {d.cancelLabel}
          </button>
          <Button variant="primary" size="sm" onClick={d.onSave}>Save</Button>
        </div>
      )}
    </Card>
  )
}

// A description is a one-breath definition, and a read note is one instruction:
// both are capped so a card stays scannable rather than growing into an essay.
// Outlined until it is named, so it is obvious which row is the unfinished one.
const newCard = { borderColor: 'var(--me-blue)', boxShadow: '0 0 0 3px rgba(4,115,234,.10)' }

const DESC_MAX = 240
const NOTE_MAX = 200

const disclosure = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 6px 2px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }

const ellip = (fs, fw, color, family) => ({ fontSize: fs, fontWeight: fw, color, fontFamily: family, ...ellipsis })
const clamp = (fs, fw, color, lines) => ({ fontSize: fs, fontWeight: fw, color, ...clampLines(lines) })
const tab = { padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const nameInput = { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--me-ink)', padding: '4px 6px' }
const descArea = { display: 'block', width: '100%', fontSize: 13, lineHeight: 1.55, color: 'var(--me-grey)', padding: '6px 6px', marginTop: 2, fontFamily: 'inherit' }
const fieldGrid = { display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1.2fr) 78px 20px', gap: 14 }
const docGrid = { display: 'grid', gridTemplateColumns: '160px minmax(0,1fr) minmax(0,1.4fr) 78px 20px', gap: 14 }
