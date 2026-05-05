import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { StateBadge } from '../components/StateBadge';
import { SortableTH, useSort } from '../components/SortableTH';

const KINDS = [
  { id: 'check', label: 'Check', desc: 'Per-rule LLM examination prompts' },
  { id: 'extract', label: 'Extract', desc: 'Vision prompts per document type' },
  { id: 'system', label: 'System', desc: 'Shared system + planner prompts' },
];

export function PromptsPage() {
  const prompts = useStore((s) => s.prompts);
  const rules = useStore((s) => s.rules);
  const navigate = useNavigate();
  const [kind, setKind] = useState('check');

  const filtered = prompts.filter((p) => p.kind === kind);
  const findRule = (pid) => rules.find((r) => r.boundPromptId === pid);

  const STATE_RANK = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, RELEASED: 3 };
  const { sort, setSort, apply } = useSort({ key: 'path', dir: 'asc' });
  const sorted = apply(filtered, {
    path:         (p) => p.path,
    boundRuleId:  (p) => p.boundRuleId || 'zzz',
    state:        (p) => STATE_RANK[p.state] ?? 9,
    lines:        (p) => (p.body || '').split('\n').length,
    lastEditedAt: (p) => p.lastEditedAt,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Engineering lane</div>
        <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          Prompt templates
        </h1>
        <p className="text-xs text-muted mt-1 max-w-2xl">
          StringTemplate (<code className="font-mono">.st</code>) bodies that consume the
          rule's <code className="font-mono">field_keys</code> and{' '}
          <code className="font-mono">ucp_excerpt</code>. The Prompt Engineer owns the body;
          binding to a rule is set in the catalog by Compliance.
        </p>
      </header>

      <div className="flex gap-1 mb-3">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`text-xs px-3 py-1.5 rounded border ${
              kind === k.id
                ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium'
                : 'border-line text-muted hover:bg-slate2'
            }`}
          >
            <span className="font-medium">{k.label}</span>
            <span className="text-[10px] ml-1 opacity-70">
              ({prompts.filter((p) => p.kind === k.id).length})
            </span>
          </button>
        ))}
        <span className="ml-3 text-[11px] text-muted self-center">
          {KINDS.find((k) => k.id === kind).desc}
        </span>
      </div>

      <div className="bg-paper border border-line rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate2 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <SortableTH sortKey="path"         sort={sort} setSort={setSort}>File</SortableTH>
              <SortableTH sortKey="boundRuleId"  sort={sort} setSort={setSort} className="w-32">Bound rule</SortableTH>
              <SortableTH sortKey="state"        sort={sort} setSort={setSort} className="w-24">State</SortableTH>
              <SortableTH sortKey="lines"        sort={sort} setSort={setSort} className="w-16">Lines</SortableTH>
              <SortableTH sortKey="lastEditedAt" sort={sort} setSort={setSort} className="w-32">Last edited</SortableTH>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((p) => {
              const r = findRule(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/admin/prompts/${encodeURIComponent(p.id)}`)}
                  className={`group cursor-pointer hover:bg-teal-1/5 hover:shadow-[inset_3px_0_0_0_#0a7e6a] transition ${
                    p.isAuthored === false ? 'bg-status-goldSoft/30' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-teal-1 group-hover:underline">
                    {p.path}
                    {p.isAuthored === false && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider bg-status-goldSoft text-status-gold border border-status-gold/40 rounded px-1 py-0.5">
                        not authored
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {r ? (
                      <Link to={`/admin/rules/${r.rule_id}`} className="font-mono text-[10px] text-teal-1 hover:underline">
                        {r.rule_id}
                      </Link>
                    ) : (
                      <span className="text-muted text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><StateBadge state={p.state} /></td>
                  <td className="px-3 py-2 font-mono text-[10px]">{p.body.split('\n').length}</td>
                  <td className="px-3 py-2 text-[10px] text-muted">
                    {new Date(p.lastEditedAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-2 text-muted group-hover:text-teal-1 text-sm">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
