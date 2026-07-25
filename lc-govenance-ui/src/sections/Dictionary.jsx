import Icon from '../ds/Icon'
import Button from '../ds/Button'
import Page from '../ds/Page'
import AutoTextarea from '../ds/AutoTextarea'
import DetailBack from '../ds/DetailBack'
import Toolbar from '../ds/Toolbar'
import SearchBar from '../ds/SearchBar'
import ViewSwitch from '../ds/ViewSwitch'
import { Z } from '../ds/z'
import { listWrap, listHead, listRow } from '../ds/listStyles'

// Dictionary — the shared vocabulary of fields and document types.
export default function Dictionary({ v }) {
  // Item detail — a single editable card with a back link (like other sections).
  if (v.isDictDetail) {
    const d = v.dictDetail
    return (
      <Page width="narrow">
        <DetailBack label="Back to dictionary" onBack={d.onBack} />
        {d.kind === 'field' ? <FieldCard f={d.row} /> : <DocCard d={d.row} />}
      </Page>
    )
  }

  return (
    <Page width="list">
      <Toolbar
        left={
          <>
            <div style={{ display: 'flex', border: '1px solid var(--me-grey-20)', borderRadius: 9, overflow: 'hidden', width: 'fit-content' }}>
              <button onClick={v.setDictFieldsTab} style={{ ...tab, background: v.dictFieldsBg, color: v.dictFieldsFg }}>Fields</button>
              <button onClick={v.setDictDocsTab} style={{ ...tab, borderLeft: '1px solid var(--me-grey-20)', background: v.dictDocsBg, color: v.dictDocsFg }}>Document types</button>
            </div>
            <SearchBar value={v.dictSearch} onChange={v.setDictSearch} placeholder="Search the dictionary…" width={280} />
          </>
        }
        right={
          <>
            {v.dictIsFields ? (
              <Button variant="primary" size="md" onClick={v.addField}>New field</Button>
            ) : (
              <Button variant="primary" size="md" onClick={v.addDoc}>New document type</Button>
            )}
            <ViewSwitch isList={v.dictIsListView} onList={v.setDictListView} onCards={v.setDictCards} />
          </>
        }
      />

      {/* ---- Fields ---- */}
      {v.dictIsFields && v.dictIsListView && (
        <div style={listWrap}>
          <div style={{ ...fieldGrid, ...listHead }}>
            <span>Code</span><span>Type</span><span>Name</span><span>Appears on</span><span>Used by</span><span />
          </div>
          {v.fieldRows.map((f) => (
            <div key={f.id} onClick={f.onOpen} style={{ ...fieldGrid, ...listRow, cursor: 'pointer' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>{f.code || '—'}</span>
              <span><span style={{ fontSize: 11, fontWeight: 600, color: f.typeColor, background: f.typeBg, borderRadius: 999, padding: '2px 9px' }}>{f.type}</span></span>
              <span style={ellip(13.5, 500, 'var(--me-ink)')}>{f.name}</span>
              <span style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{f.docChips.length ? `${f.docChips.length} doc${f.docChips.length === 1 ? '' : 's'}` : '—'}</span>
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
            <span>Key</span><span>Name</span><span>Description</span><span>Used by</span><span />
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

function FieldCard({ f }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="inline-edit" value={f.code} onChange={f.onChangeCode} placeholder="Code" style={{ width: 88, flexShrink: 0, padding: '6px 9px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }} />
        <select value={f.type} onChange={f.onChangeType} style={{ flexShrink: 0, height: 32, border: '1px solid var(--me-grey-20)', borderRadius: 7, padding: '0 8px', fontSize: 11.5, fontWeight: 600, color: f.typeColor, background: f.typeBg, cursor: 'pointer', outline: 'none' }}>
          <option value="LC field">LC field</option>
          <option value="Document data point">Document data point</option>
          <option value="Derived">Derived</option>
          <option value="External">External</option>
        </select>
        <input className="inline-edit" value={f.name} onChange={f.onChangeName} placeholder="Field name" style={nameInput} />
        <button onClick={f.onRemove} title="Remove" style={trashBtn}><Icon name="trash-2" size={15} /></button>
      </div>
      <AutoTextarea className="inline-edit" value={f.description} onChange={f.onChangeDesc} onBlur={f.onBlurDesc} placeholder="Short description of what this field holds…" maxLength={DESC_MAX} style={descArea} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingLeft: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)' }}>Appears on</span>
        {f.docChips.map((dc, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--me-grey)', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 999, padding: '3px 6px 3px 10px' }}>
            {dc.name}
            <button onClick={dc.onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', padding: 0 }}><Icon name="x" size={11} /></button>
          </span>
        ))}
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={f.onTogglePicker} style={dashChip}>+ Document type</button>
          {f.pickerOpen && (
            <div style={{ ...popover, top: 30, left: 0, width: 240, maxHeight: 240, overflow: 'auto' }}>
              {f.docBook.map((db, i) => (
                <button key={i} onClick={db.onAdd} style={{ width: '100%', textAlign: 'left', padding: '8px 9px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--me-ink)' }}>{db.name}</button>
              ))}
            </div>
          )}
        </span>
      </div>
    </div>
  )
}

function DocCard({ d }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="inline-edit" value={d.key} onChange={d.onChangeKey} placeholder="KEY" style={{ width: 180, flexShrink: 0, padding: '6px 9px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }} />
        <input className="inline-edit" value={d.name} onChange={d.onChangeName} placeholder="Document name" style={nameInput} />
        <button onClick={d.onRemove} title="Remove" style={trashBtn}><Icon name="trash-2" size={15} /></button>
      </div>
      <AutoTextarea className="inline-edit" value={d.description} onChange={d.onChangeDesc} onBlur={d.onBlurDesc} placeholder="Short description of this document type…" maxLength={DESC_MAX} style={descArea} />
    </div>
  )
}

// A description is a one-breath definition — this cap keeps it concise (and keeps
// the auto-growing field a few lines tall at most, no scrollbar needed).
const DESC_MAX = 240

const ellip = (fs, fw, color, family) => ({ fontSize: fs, fontWeight: fw, color, fontFamily: family, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const clamp = (fs, fw, color, lines) => ({ fontSize: fs, fontWeight: fw, color, display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
const tab = { padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const card = { background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 12, boxShadow: '0 1px 4px rgba(27,28,30,.05)', padding: '14px 16px' }
const nameInput = { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--me-ink)', padding: '4px 6px' }
const descArea = { display: 'block', width: '100%', fontSize: 13, lineHeight: 1.55, color: 'var(--me-grey)', padding: '6px 6px', marginTop: 2, fontFamily: 'inherit' }
const trashBtn = { width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const dashChip = { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px dashed var(--me-grey-20)', background: 'none', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 11.5, color: 'var(--me-grey-70)' }
const popover = { position: 'absolute', zIndex: Z.popover, background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 10, boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: 6 }
const fieldGrid = { display: 'grid', gridTemplateColumns: '90px 140px minmax(0,1fr) 84px 78px 20px', gap: 14 }
const docGrid = { display: 'grid', gridTemplateColumns: '160px minmax(0,1fr) minmax(0,1.4fr) 78px 20px', gap: 14 }
