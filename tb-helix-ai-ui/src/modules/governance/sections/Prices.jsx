// Model price book — list overview, cards summary, detail for edit + save.
//
// Self-contained on purpose: this tab may go away, and it must not grow into the
// governance catalogue store. Rates are USD per million tokens, flat per family
// (no length bands in the console). Discard / delete use the module ConfirmDialog.

import { useEffect, useMemo, useState } from 'react'
import Page from '@shared/ds/Page'
import Toolbar from '@shared/ds/Toolbar'
import SearchBar from '@shared/ds/SearchBar'
import ViewSwitch from '@shared/ds/ViewSwitch'
import SortHeader from '@shared/ds/SortHeader'
import DetailBack from '@shared/ds/DetailBack'
import Button from '@shared/ds/Button'
import TextField from '@shared/ds/TextField'
import IconButton from '@shared/ds/IconButton'
import Icon from '@shared/ds/Icon'
import { cardSurface } from '@shared/ds/Card'
import { listWrap, listHead } from '@shared/ds/listStyles'
import { ellipsis } from '@shared/ds/text'
import { loadPrices, savePrice, deletePrice, persists } from '../api/governanceApi'

const TIERS = ['none', 'economy', 'balanced', 'frontier']

// Identity + rates up front for a glance scan; Quoted trails after a flex gutter.
const COLS = {
  display: 'grid',
  gridTemplateColumns: '96px minmax(120px, 180px) 84px 78px 78px 78px minmax(24px, 1fr) 96px 24px',
  gap: 14,
  alignItems: 'center',
}

function displayName(row) {
  return (row.label || '').trim() || row.family || '—'
}

const blank = () => ({
  family: '',
  label: '',
  vendor: '',
  tier: 'economy',
  inPerMillion: '0',
  outPerMillion: '0',
  cachedInPerMillion: '',
  patterns: '',
  note: '',
  quotedOn: new Date().toISOString().slice(0, 10),
  _new: true,
  _dirty: true,
  _key: `new-${Date.now()}`,
})

const fromApi = (row) => ({
  family: row.family ?? '',
  label: row.label ?? '',
  vendor: row.vendor ?? '',
  tier: row.tier ?? 'economy',
  inPerMillion: num(row.inPerMillion),
  outPerMillion: num(row.outPerMillion),
  cachedInPerMillion: row.cachedInPerMillion == null ? '' : num(row.cachedInPerMillion),
  patterns: Array.isArray(row.patterns) ? row.patterns.join(', ') : (row.patterns || ''),
  note: row.note ?? '',
  quotedOn: row.quotedOn ?? '',
  _new: false,
  _dirty: false,
  _key: row.family,
})

/** Always flat — empty bands so a save clears any legacy band rows. */
const toApi = (row) => ({
  family: row.family.trim(),
  label: row.label.trim() || row.family.trim(),
  vendor: row.vendor.trim() || 'unknown',
  tier: row.tier,
  inPerMillion: Number(row.inPerMillion) || 0,
  outPerMillion: Number(row.outPerMillion) || 0,
  cachedInPerMillion: row.cachedInPerMillion === '' ? null : Number(row.cachedInPerMillion),
  patterns: row.patterns.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
  note: row.note.trim() || null,
  quotedOn: row.quotedOn || null,
  bands: [],
})

function num(v) {
  if (v == null || v === '') return '0'
  return String(v)
}

function rate(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return String(Number(n.toFixed(4)))
}

export default function Prices({ requestConfirm }) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [view, setView] = useState('list')
  const [activeKey, setActiveKey] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ col: 'vendor', dir: 'asc' })

  useEffect(() => {
    setStatus('loading')
    setError(null)
    loadPrices()
      .then((list) => {
        setRows((list || []).map(fromApi))
        setStatus('ready')
        setActiveKey(null)
      })
      .catch((e) => {
        setError(e?.message || String(e))
        setStatus('error')
      })
  }, [])

  const active = rows.find((r) => r._key === activeKey) || null
  const activeIdx = active ? rows.findIndex((r) => r._key === activeKey) : -1

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = rows
    if (q) {
      list = list.filter((r) =>
        [r.family, r.label, r.vendor, r.patterns, r.note].join(' ').toLowerCase().includes(q))
    }
    const { col, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = sortValue(a, col)
      const bv = sortValue(b, col)
      if (av < bv) return -1 * mul
      if (av > bv) return 1 * mul
      const v = a.vendor.localeCompare(b.vendor)
      if (v !== 0) return v
      return displayName(a).localeCompare(displayName(b))
    })
  }, [rows, query, sort])

  const sortCol = (col) => ({
    active: sort.col === col,
    dir: sort.col === col ? sort.dir : 'asc',
    onSort: () => setSort((s) => (
      s.col === col
        ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )),
  })

  const doLeave = () => {
    if (active?._new) {
      setRows((prev) => prev.filter((r) => r._key !== activeKey))
    }
    setActiveKey(null)
  }

  const leaveDetail = () => {
    if (!active?._dirty) {
      doLeave()
      return
    }
    const name = displayName(active)
    requestConfirm({
      title: 'Leave without saving?',
      message: `${name === '—' ? 'This model' : `“${name}”`} has changes that have not been saved. Leaving now throws them away.`,
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard changes',
      onConfirm: doLeave,
    })
  }

  const addModel = () => {
    const row = blank()
    setRows((prev) => [row, ...prev])
    setActiveKey(row._key)
  }

  const patch = (partial) => {
    if (activeIdx < 0) return
    setRows((prev) => prev.map((r, j) => (
      j === activeIdx ? { ...r, ...partial, _dirty: true } : r
    )))
  }

  const save = async () => {
    if (!active) return
    const family = active.family.trim()
    if (!family) {
      setError('Family key is required')
      return
    }
    setBusy(family)
    setError(null)
    try {
      await savePrice(toApi(active))
      setRows((prev) => prev.map((r) => (
        r._key === activeKey
          ? { ...r, family, _key: family, _new: false, _dirty: false }
          : r
      )))
      setActiveKey(family)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const remove = () => {
    if (!active) return
    if (active._new) {
      setRows((prev) => prev.filter((r) => r._key !== activeKey))
      setActiveKey(null)
      return
    }
    const family = active.family
    const name = displayName(active)
    requestConfirm({
      title: 'Delete model?',
      message: `“${name}” (${family}) will be removed from the price book. Spend that already matched it will re-price as unpriced until a pattern covers it again.`,
      confirmLabel: 'Delete model',
      onConfirm: async () => {
        setBusy(family)
        setError(null)
        try {
          await deletePrice(family)
          setRows((prev) => prev.filter((r) => r._key !== activeKey))
          setActiveKey(null)
        } catch (e) {
          setError(e?.message || String(e))
        } finally {
          setBusy(null)
        }
      },
    })
  }

  if (active) {
    return (
      <Page width="detail" style={{ paddingTop: 20 }}>
        <DetailBack label="Back to models" onBack={leaveDetail} />
        <DetailForm
          row={active}
          busy={busy}
          error={error}
          onPatch={patch}
          onSave={save}
          onDelete={remove}
          onClearError={() => setError(null)}
        />
      </Page>
    )
  }

  return (
    <Page width="detail" style={{ paddingTop: 8 }}>
      <Toolbar
        left={
          <SearchBar
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by model, vendor or pattern…"
          />
        }
        right={
          <>
            <Button variant="primary" size="sm" onClick={addModel}>New model</Button>
            <ViewSwitch isList={view === 'list'} onList={() => setView('list')} onCards={() => setView('cards')} />
          </>
        }
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--me-ink)', letterSpacing: '-0.01em' }}>
          Models
        </div>
        <div style={{ fontSize: 13, color: 'var(--me-grey-70)', marginTop: 4, lineHeight: 1.45 }}>
          Standing rates (USD per million tokens), one flat rate per family. Patterns resolve a
          configured model id onto a family (longest wins). Save reloads the in-process book.
          {!persists && ' Mock session — writes stay local until you switch to the API.'}
        </div>
      </div>

      {error && (
        <div style={{ ...cardSurface(10), padding: '10px 14px', marginBottom: 14, color: 'var(--status-error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {status === 'loading' && (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--me-grey-70)' }}>
          Loading price book…
        </div>
      )}

      {status === 'error' && !rows.length && (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--me-grey-70)' }}>
          Could not load prices.
        </div>
      )}

      {status !== 'loading' && view === 'list' && (
        <div style={listWrap}>
          <div style={{ ...COLS, ...listHead }}>
            <SortHeader label="Vendor" {...sortCol('vendor')} />
            <SortHeader label="Model" {...sortCol('label')} />
            <SortHeader label="Tier" {...sortCol('tier')} />
            <SortHeader label="In / M" {...sortCol('in')} align="right" />
            <SortHeader label="Out / M" {...sortCol('out')} align="right" />
            <span style={{ textAlign: 'right' }}>Cached</span>
            <span aria-hidden />
            <SortHeader label="Quoted" {...sortCol('quoted')} />
            <span />
          </div>
          {shown.map((row) => (
            <button
              key={row._key}
              type="button"
              onClick={() => setActiveKey(row._key)}
              style={{
                ...COLS,
                width: '100%',
                textAlign: 'left',
                padding: '13px 20px',
                border: 'none',
                borderBottom: '1px solid var(--me-grey-08)',
                background: '#fff',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--me-grey)', ...ellipsis }}>{row.vendor || '—'}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--me-ink)', ...ellipsis }}>
                {displayName(row)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--me-grey)' }}>{row.tier || '—'}</span>
              <span style={monoRight}>{rate(row.inPerMillion)}</span>
              <span style={monoRight}>{rate(row.outPerMillion)}</span>
              <span style={monoRight}>{row.cachedInPerMillion === '' ? '—' : rate(row.cachedInPerMillion)}</span>
              <span aria-hidden />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)', textAlign: 'right' }}>
                {row.quotedOn || '—'}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--me-grey-50)' }}>
                <Icon name="chevron-right" size={18} color="currentColor" />
              </span>
            </button>
          ))}
          {shown.length === 0 && status === 'ready' && (
            <div style={{ padding: '36px 16px', textAlign: 'center', fontSize: 13, color: 'var(--me-grey-70)' }}>
              {query.trim() ? 'No models match the search.' : 'No models yet. Add one, or check that the migration seeded the book.'}
            </div>
          )}
        </div>
      )}

      {status !== 'loading' && view === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {shown.map((row) => (
            <button
              key={row._key}
              type="button"
              onClick={() => setActiveKey(row._key)}
              style={{
                ...cardSurface(12),
                textAlign: 'left',
                padding: '14px 16px',
                cursor: 'pointer',
                border: 'none',
                font: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--me-grey)' }}>{row.vendor || '—'} · {row.tier || '—'}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--me-ink)', marginTop: 2, ...ellipsis }}>
                  {displayName(row)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <RateChip label="In" value={rate(row.inPerMillion)} />
                <RateChip label="Out" value={rate(row.outPerMillion)} />
                <RateChip label="Cached" value={row.cachedInPerMillion === '' ? '—' : rate(row.cachedInPerMillion)} />
              </div>
              {row.quotedOn && (
                <div style={{ fontSize: 12, color: 'var(--me-grey)', borderTop: '1px solid var(--me-grey-08)', paddingTop: 10 }}>
                  Quoted {row.quotedOn}
                </div>
              )}
            </button>
          ))}
          {shown.length === 0 && status === 'ready' && (
            <div style={{ gridColumn: '1 / -1', padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--me-grey-70)' }}>
              {query.trim() ? 'No models match the search.' : 'No models yet. Add one, or check that the migration seeded the book.'}
            </div>
          )}
        </div>
      )}
    </Page>
  )
}

function DetailForm({ row, busy, error, onPatch, onSave, onDelete, onClearError }) {
  return (
    <div style={{ ...cardSurface(12), padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--me-ink)', letterSpacing: '-0.01em' }}>
            {row._new ? 'New model' : row.family}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--me-grey-70)', marginTop: 3 }}>
            Edit the flat standing rate, then Save. The spend ledger re-prices from this book on the next read.
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!row._dirty || busy === row.family || !row.family.trim()}
          onClick={onSave}
        >
          {busy === row.family ? '…' : 'Save'}
        </Button>
        <IconButton icon="trash-2" size="sm" tone="danger" title="Delete model" onClick={onDelete} />
      </div>

      {error && (
        <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, background: '#fbe3e1', color: 'var(--status-error)', fontSize: 13 }}>
          {error}
          <button type="button" onClick={onClearError} style={{ marginLeft: 10, border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 0.9fr 0.9fr', gap: 10, alignItems: 'end' }}>
        <Field label="Family">
          <TextField
            mono
            value={row.family}
            disabled={!row._new}
            onChange={(e) => onPatch({ family: e.target.value })}
            placeholder="qwen-flash"
          />
        </Field>
        <Field label="Label">
          <TextField value={row.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </Field>
        <Field label="Vendor">
          <TextField value={row.vendor} onChange={(e) => onPatch({ vendor: e.target.value })} />
        </Field>
        <Field label="Tier">
          <select value={row.tier} onChange={(e) => onPatch({ tier: e.target.value })} style={selectStyle}>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        <Field label="In / M">
          <TextField mono value={row.inPerMillion} onChange={(e) => onPatch({ inPerMillion: e.target.value })} />
        </Field>
        <Field label="Out / M">
          <TextField mono value={row.outPerMillion} onChange={(e) => onPatch({ outPerMillion: e.target.value })} />
        </Field>
        <Field label="Cached in / M">
          <TextField mono value={row.cachedInPerMillion} onChange={(e) => onPatch({ cachedInPerMillion: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Quoted on">
          <TextField mono value={row.quotedOn} onChange={(e) => onPatch({ quotedOn: e.target.value })} placeholder="YYYY-MM-DD" />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Match patterns (comma-separated)">
          <TextField
            mono
            value={row.patterns}
            onChange={(e) => onPatch({ patterns: e.target.value })}
            placeholder="qwen3.7-flash, qwen-flash, qwen-vl-flash"
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Note">
          <TextField value={row.note} onChange={(e) => onPatch({ note: e.target.value })} />
        </Field>
      </div>
    </div>
  )
}

function RateChip({ label, value }) {
  return (
    <div style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--me-grey-08)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }}>{label}</div>
      <div style={{ marginTop: 2, color: 'var(--me-ink)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--me-grey-70)', letterSpacing: '0.02em' }}>{label}</span>
      {children}
    </label>
  )
}

function sortValue(row, col) {
  switch (col) {
    case 'label': return displayName(row).toLowerCase()
    case 'vendor': return (row.vendor || '').toLowerCase()
    case 'tier': return row.tier || ''
    case 'in': return Number(row.inPerMillion) || 0
    case 'out': return Number(row.outPerMillion) || 0
    case 'quoted': return row.quotedOn || ''
    default: return displayName(row).toLowerCase()
  }
}

const monoRight = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--me-ink)',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}

const selectStyle = {
  height: 36,
  border: '1px solid var(--me-grey-20)',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 13,
  color: 'var(--me-ink)',
  background: '#fff',
  fontFamily: 'inherit',
  width: '100%',
}
