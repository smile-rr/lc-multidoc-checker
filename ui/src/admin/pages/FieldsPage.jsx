import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SortableTH, useSort } from '../components/SortableTH';
import fieldsData from '../fieldsData.json';

const DOC_TYPES = ['ALL', 'LC', 'INV', 'BOL', 'PKL', 'BOE', 'BC', 'WC', 'INS'];
const TYPES     = ['ALL', 'STRING', 'AMOUNT', 'DATE', 'NUMBER', 'ENUM', 'BOOL', 'TEXT'];

// Field-type colour code — lighter than the rule-tier palette so the two
// catalogs feel adjacent but visually distinct.
const TYPE_TONE = {
  STRING: 'text-slate-700 bg-slate-100',
  AMOUNT: 'text-status-green bg-status-greenSoft',
  DATE:   'text-status-blue bg-status-blueSoft',
  NUMBER: 'text-status-blue bg-status-blueSoft',
  ENUM:   'text-purple-700 bg-purple-50',
  BOOL:   'text-purple-700 bg-purple-50',
  TEXT:   'text-status-gold bg-status-goldSoft',
};

export function FieldsPage() {
  const navigate = useNavigate();
  const fields = fieldsData.fields;
  const [docF, setDocF]       = useState('ALL');
  const [typeF, setTypeF]     = useState('ALL');
  const [q, setQ]             = useState('');
  const [showOrphan, setOrphan] = useState(false);

  const filtered = useMemo(() => fields.filter((f) => {
    const usage = (f.used_by_rules?.length || 0) + (f.used_by_prompts?.length || 0);
    if (showOrphan && usage > 0) return false;
    if (docF !== 'ALL' && !(f.applies_to || []).includes(docF)) return false;
    if (typeF !== 'ALL' && f.type !== typeF) return false;
    if (q && !`${f.key} ${f.name_en} ${f.description || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [fields, docF, typeF, q, showOrphan]);

  const total      = fields.length;
  const canonical  = fields.filter((f) => f.reconcile_canonical).length;
  const orphans    = fields.filter((f) => !(f.used_by_rules?.length || f.used_by_prompts?.length)).length;

  const TYPE_RANK = { STRING: 0, AMOUNT: 1, DATE: 2, NUMBER: 3, ENUM: 4, BOOL: 5, TEXT: 6 };
  const { sort, setSort, apply } = useSort({ key: 'key', dir: 'asc' });
  const sorted = apply(filtered, {
    key:        (f) => f.key,
    name_en:    (f) => f.name_en || f.key,
    type:       (f) => TYPE_RANK[f.type] ?? 9,
    applies_to: (f) => (f.applies_to || []).join(','),
    canonical:  (f) => (f.reconcile_canonical ? 0 : 1),
    used:       (f) => (f.used_by_rules?.length || 0) + (f.used_by_prompts?.length || 0),
  });

  return (
    <div className="px-6 py-5 max-w-[1280px] mx-auto">
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Reference vocabulary</div>
        <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          Field pool
        </h1>
        <p className="text-[11px] text-muted mt-1 max-w-2xl">
          The canonical vocabulary every parser, prompt, and rule must speak. Compliance owns
          semantic meaning; engineering owns the SWIFT-tag binding for LC fields. Rename or
          retire a field here and the impact ripples through to every artifact that cites it.
        </p>
      </header>

      {/* ── COUNT STRIP ────────────────────────────────────────────────────── */}
      <div className="mb-3 flex items-baseline gap-6 text-[11px]">
        <Stat n={total}     label="fields" />
        <Stat n={canonical} label="reconcile-canonical" tone="text-teal-1" />
        <Stat n={orphans}   label="orphaned"            tone="text-status-gold" />
      </div>

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-lg px-3 py-2 mb-3 flex items-center gap-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search field key, name, description…"
          className="text-xs px-2 py-1 border-0 border-b border-line bg-transparent w-72 focus:outline-none focus:border-teal-1"
        />
        <span className="h-4 w-px bg-line/70" />
        <FilterPills label="doc"  values={DOC_TYPES} active={docF}  onChange={setDocF} />
        <span className="h-4 w-px bg-line/70" />
        <FilterPills label="type" values={TYPES}     active={typeF} onChange={setTypeF} />
        <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showOrphan}
                 onChange={(e) => setOrphan(e.target.checked)} className="accent-teal-1" />
          orphans only
        </label>
      </div>

      {/* ── COUNT LINE ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {sorted.length} {sorted.length === 1 ? 'field' : 'fields'}
        </div>
      </div>

      {/* ── TABLE ──────────────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.16em] text-muted border-b border-line">
              <SortableTH sortKey="key"        sort={sort} setSort={setSort} className="w-40 text-left pl-3">key</SortableTH>
              <SortableTH sortKey="name_en"    sort={sort} setSort={setSort} className="text-left">name</SortableTH>
              <SortableTH sortKey="type"       sort={sort} setSort={setSort} className="w-20 text-left">type</SortableTH>
              <SortableTH sortKey="applies_to" sort={sort} setSort={setSort} className="w-44 text-left">applies to</SortableTH>
              <SortableTH sortKey="canonical"  sort={sort} setSort={setSort} className="w-20 text-left">canon.</SortableTH>
              <SortableTH sortKey="used"       sort={sort} setSort={setSort} className="w-20 text-right pr-3">used</SortableTH>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const used = (f.used_by_rules?.length || 0) + (f.used_by_prompts?.length || 0);
              const tone = TYPE_TONE[f.type] || 'text-muted bg-slate-100';
              return (
                <tr
                  key={f.key}
                  onClick={() => navigate(`/admin/fields/${f.key}`)}
                  className="group cursor-pointer border-b border-line/40 last:border-b-0 transition hover:bg-teal-1/[0.04]"
                >
                  <td className="py-2.5 pl-3 font-mono text-teal-1 group-hover:underline whitespace-nowrap">
                    {f.key}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-navy-1">{f.name_en}</span>
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider ${tone}`}>
                      {f.type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-[10px] text-muted/90">
                      {(f.applies_to || []).join(' · ')}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {f.reconcile_canonical
                      ? <span className="text-[10px] uppercase tracking-[0.12em] text-teal-1">yes</span>
                      : <span className="text-[10px] uppercase tracking-[0.12em] text-muted/70">no</span>}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-right ${used === 0 ? 'text-status-gold' : 'text-navy-1/80'}`}>
                    {used || <span className="opacity-70">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-muted group-hover:text-teal-1 text-sm text-right">›</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-[11px] text-muted italic">
                No fields match the current filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ n, label, tone = 'text-navy-1' }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`font-mono text-base ${tone}`}>{n}</span>
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</span>
    </span>
  );
}

function FilterPills({ label, values, active, onChange }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted/70">{label}</span>
      <span className="flex gap-0.5">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
              active === v ? 'text-teal-1 bg-teal-1/10' : 'text-muted/80 hover:text-navy-1'
            }`}
          >
            {v === 'ALL' ? 'all' : v.toLowerCase()}
          </button>
        ))}
      </span>
    </span>
  );
}
