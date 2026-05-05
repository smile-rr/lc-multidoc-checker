import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, STATES } from '../store';
import { StateBadge, SeverityBadge, TierBadge } from '../components/StateBadge';
import { HealthChips } from '../components/HealthChips';

const TOPIC = ['ALL', 'DATE', 'DOCSET', 'AMT', 'PARTY', 'GOODS', 'TRANS', 'INS', 'CERT', 'EXAM'];

export function RulesPage() {
  const rules = useStore((s) => s.rules);
  const navigate = useNavigate();
  const [topic, setTopic] = useState('ALL');
  const [stateF, setStateF] = useState('ALL');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => rules.filter((r) => {
    if (topic !== 'ALL' && !r.rule_id.startsWith(topic)) return false;
    if (stateF !== 'ALL' && r.state !== stateF) return false;
    if (q && !`${r.rule_id} ${r.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rules, topic, stateF, q]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Compliance lane</div>
        <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          Rule catalog
        </h1>
        <p className="text-xs text-muted mt-1 max-w-2xl">
          Source of truth for what each rule means, why it exists, and which UCP / ISBP
          paragraph it cites. Compliance owns this surface; engineering consumes it via
          bound prompt templates at runtime.
        </p>
      </header>

      <div className="bg-paper border border-line rounded mb-3 px-3 py-2 flex items-center gap-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rule id or name…"
          className="text-xs px-2 py-1 border border-line rounded w-64 focus:outline-none focus:border-teal-1"
        />
        <div className="flex gap-1">
          {TOPIC.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`text-[10px] font-mono px-2 py-1 rounded border ${
                topic === t ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium' : 'border-line text-muted hover:bg-slate2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {['ALL', ...STATES].map((s) => (
            <button
              key={s}
              onClick={() => setStateF(s)}
              className={`text-[10px] font-mono px-2 py-1 rounded border ${
                stateF === s ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium' : 'border-line text-muted hover:bg-slate2'
              }`}
            >
              {s === 'ALL' ? 'ALL' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
        {filtered.length} rules · click any row to view or edit
      </div>
      <div className="bg-paper border border-line rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate2 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-28">Rule ID</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium w-24">Tier</th>
              <th className="text-left px-3 py-2 font-medium w-20">Severity</th>
              <th className="text-left px-3 py-2 font-medium w-24">State</th>
              <th className="text-left px-3 py-2 font-medium w-32">Bound prompt</th>
              <th className="text-left px-3 py-2 font-medium w-32">Citations</th>
              <th className="text-left px-3 py-2 font-medium w-24">Health</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((r) => (
              <tr
                key={r.rule_id}
                onClick={() => navigate(`/admin/rules/${r.rule_id}`)}
                className="group cursor-pointer hover:bg-teal-1/5 hover:shadow-[inset_3px_0_0_0_#0a7e6a] transition"
              >
                <td className="px-3 py-2 font-mono text-teal-1 group-hover:underline">
                  {r.rule_id}
                </td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2"><TierBadge type={r.check_type} /></td>
                <td className="px-3 py-2"><SeverityBadge severity={r.severity} /></td>
                <td className="px-3 py-2"><StateBadge state={r.state} /></td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {r.boundPromptId ? (
                    <Link to={`/admin/prompts/${encodeURIComponent(r.boundPromptId)}`}
                          className="font-mono text-[10px] text-teal-1 hover:underline flex items-center gap-1">
                      <span className="truncate max-w-[110px]">{r.boundPromptId.replace('check/', '')}</span>
                      {r.boundPromptState === 'DRAFT' && (
                        <span className="text-status-red" title="Bound prompt is in draft">⚠</span>
                      )}
                    </Link>
                  ) : (
                    <span className="text-muted text-[10px]">— SpEL —</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(r.ucp_refs || []).map((id) => (
                      <span key={id} className="text-[9px] font-mono text-status-blue bg-status-blueSoft px-1 rounded">{id}</span>
                    ))}
                    {(r.isbp_refs || []).map((id) => (
                      <span key={id} className="text-[9px] font-mono text-purple-700 bg-purple-50 px-1 rounded">{id}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2"><HealthChips signals={r.health_signals} layout="dots" /></td>
                <td className="px-2 py-2 text-muted group-hover:text-teal-1 text-sm">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
