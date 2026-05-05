import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, STATES } from '../store';
import { SortableTH, useSort } from '../components/SortableTH';

const TOPIC = ['ALL', 'DATE', 'DOCSET', 'AMT', 'PARTY', 'GOODS', 'TRANS', 'INS', 'CERT', 'EXAM'];

// Visual encoding — color + single letter for tier, colored words for severity/state.
// Goal: same row reads as one sentence, not as a row of pills.
const TIER = {
  PROGRAMMATIC: { short: 'PROG',     chip: 'text-slate-700 bg-slate-100',         desc: 'Programmatic — SpEL, deterministic, no LLM.' },
  AGENT:        { short: 'AGENT',    chip: 'text-teal-1 bg-teal-1/10',            desc: 'Agent — single LLM call, structured JSON.' },
  AGENT_TOOL:   { short: 'AGENT+TOOL', chip: 'text-status-blue bg-status-blueSoft', desc: 'Agent + Tool — LLM with one tool round.' },
  AGENTIC:      { short: 'AGENTIC',  chip: 'text-purple-700 bg-purple-50',        desc: 'Agentic — LLM tool-calling reasoning loop.' },
};
const SEV = {
  CRITICAL: 'text-status-red',
  MAJOR:    'text-status-gold',
  MINOR:    'text-muted',
};
const STATE_TONE = {
  DRAFT:     'text-status-gold',
  SUBMITTED: 'text-status-blue',
  APPROVED:  'text-purple-700',
  RELEASED:  'text-status-green',
};

export function RulesPage() {
  const rules = useStore((s) => s.rules);
  const navigate = useNavigate();
  const [topic, setTopic] = useState('ALL');
  const [stateF, setStateF] = useState('ALL');
  const [q, setQ] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const filtered = useMemo(() => rules.filter((r) => {
    if (!showDisabled && r.enabled === false) return false;
    if (topic !== 'ALL' && !r.rule_id.startsWith(topic)) return false;
    if (stateF !== 'ALL' && r.state !== stateF) return false;
    if (q && !`${r.rule_id} ${r.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rules, topic, stateF, q, showDisabled]);

  const enabledTotal  = rules.filter((r) => r.enabled !== false).length;
  const disabledTotal = rules.length - enabledTotal;

  const { sort, setSort, apply } = useSort({ key: 'rule_id', dir: 'asc' });
  const SEV_RANK   = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
  const STATE_RANK = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, RELEASED: 3 };
  const TIER_RANK  = { PROGRAMMATIC: 0, AGENT: 1, AGENT_TOOL: 2, AGENTIC: 3 };
  const sorted = apply(filtered, {
    rule_id:    (r) => r.rule_id,
    name:       (r) => r.name,
    check_type: (r) => TIER_RANK[r.check_type] ?? 9,
    severity:   (r) => SEV_RANK[r.severity] ?? 9,
    state:      (r) => STATE_RANK[r.state] ?? 9,
    refs:       (r) => (r.ucp_refs?.length || 0) + (r.isbp_refs?.length || 0),
  });

  return (
    <div className="px-6 py-5 max-w-[1280px] mx-auto">
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Compliance lane</div>
        <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          Rule catalog
        </h1>
        <p className="text-[11px] text-muted mt-1 max-w-2xl">
          Source of truth for what each rule means, why it exists, and which UCP / ISBP
          paragraph it cites. Compliance owns this surface; engineering consumes it via
          bound prompt templates at runtime.
        </p>
      </header>

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-lg px-3 py-2 mb-3 flex items-center gap-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rule id or name…"
          className="text-xs px-2 py-1 border-0 border-b border-line bg-transparent w-72 focus:outline-none focus:border-teal-1"
        />
        <span className="h-4 w-px bg-line/70" />
        <FilterPills label="topic"  values={TOPIC}             active={topic}  onChange={setTopic} />
        <span className="ml-auto" />
        <FilterPills label="state"  values={['ALL', ...STATES]} active={stateF} onChange={setStateF} />
      </div>

      {/* ── COUNTS / TOGGLE ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {filtered.length} {filtered.length === 1 ? 'rule' : 'rules'}
          {!showDisabled && disabledTotal > 0 && (
            <span className="ml-2 normal-case tracking-normal">
              · {enabledTotal} enabled, {disabledTotal} disabled hidden
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => setShowDisabled(e.target.checked)}
            className="accent-teal-1"
          />
          show disabled
        </label>
      </div>

      {/* ── TABLE ──────────────────────────────────────────────────────────── */}
      <div className="bg-paper border border-line rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.16em] text-muted border-b border-line">
              <SortableTH sortKey="rule_id"    sort={sort} setSort={setSort} className="w-28 text-left pl-3">id</SortableTH>
              <SortableTH sortKey="name"       sort={sort} setSort={setSort} className="text-left">name</SortableTH>
              <SortableTH sortKey="check_type" sort={sort} setSort={setSort} className="w-28 text-left">type</SortableTH>
              <SortableTH sortKey="severity"   sort={sort} setSort={setSort} className="w-24 text-left">severity</SortableTH>
              <SortableTH sortKey="state"      sort={sort} setSort={setSort} className="w-24 text-left">state</SortableTH>
              <SortableTH sortKey="refs"       sort={sort} setSort={setSort} className="w-16 text-right pr-3">refs</SortableTH>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const tier = TIER[r.check_type] || TIER.AGENT;
              const refs = (r.ucp_refs?.length || 0) + (r.isbp_refs?.length || 0);
              const dis  = r.enabled === false;
              return (
                <tr
                  key={r.rule_id}
                  onClick={() => navigate(`/admin/rules/${r.rule_id}`)}
                  className={`group cursor-pointer border-b border-line/40 last:border-b-0 transition ${
                    dis ? 'opacity-50 hover:opacity-100' : ''
                  } hover:bg-teal-1/[0.04]`}
                >
                  <td className="py-2.5 pl-3 font-mono text-teal-1 group-hover:underline whitespace-nowrap">
                    {r.rule_id}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-navy-1">{r.name}</span>
                    {dis && <span className="ml-2 text-[9px] uppercase tracking-wider text-muted">disabled</span>}
                  </td>
                  <td className="py-2.5">
                    <span title={tier.desc}
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider ${tier.chip}`}>
                      {tier.short}
                    </span>
                  </td>
                  <td className={`py-2.5 ${SEV[r.severity] || ''} text-[11px] uppercase tracking-[0.12em] font-medium`}>
                    {r.severity?.toLowerCase()}
                  </td>
                  <td className={`py-2.5 ${STATE_TONE[r.state] || 'text-muted'} text-[11px] uppercase tracking-[0.12em]`}>
                    {(r.state || '').toLowerCase().replace('_', ' ')}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-right text-navy-1/80">
                    {refs || <span className="text-muted">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-muted group-hover:text-teal-1 text-sm text-right">›</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-[11px] text-muted italic">
                No rules match the current filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
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
              active === v
                ? 'text-teal-1 bg-teal-1/10'
                : 'text-muted/80 hover:text-navy-1'
            }`}
          >
            {v === 'ALL' ? 'all' : v.toLowerCase().replace('_', ' ')}
          </button>
        ))}
      </span>
    </span>
  );
}
