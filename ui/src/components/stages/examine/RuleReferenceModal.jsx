import React, { useMemo, useState } from 'react';
import { Modal } from '../../shared/Modal';
import { SeverityChip } from '../../shared/SeverityChip';
import { DocTypeBadge } from '../../shared/DocTypeBadge';
import { CitationChip } from './CitationChip';

const TIER = [
  { key: 'PROGRAMMATIC', label: 'Programmatic',
    sub: 'deterministic SpEL — no LLM',
    chipCls: 'bg-teal-1/15 text-teal-2 border-teal-2/40' },
  { key: 'AGENT', label: 'Agent',
    sub: 'single ChatClient call · structured JSON',
    chipCls: 'bg-navy-1/10 text-navy-1 border-navy-1/40' },
  { key: 'AGENT_TOOL', label: 'Agent + Tool',
    sub: 'ChatClient + ExamineToolRegistry · single round',
    chipCls: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: 'AGENTIC', label: 'Agentic',
    sub: 'tool-calling reasoning loop',
    chipCls: 'bg-purple-50 text-purple-700 border-purple-300' },
];

/**
 * Compliance Reference modal — full v2 rule catalog (20 rules), grouped by
 * execution tier. Pure read-only overview; opens from the Examine toolbar.
 *
 * Data source: the same `rules` array fed to ExaminePanel by useRules — no
 * extra fetch, so every rule's UCP/ISBP refs are already enriched server-side.
 */
export function RuleReferenceModal({ open, onClose, rules }) {
  const [filter, setFilter] = useState('');

  const grouped = useMemo(() => {
    const out = Object.fromEntries(TIER.map(t => [t.key, []]));
    const q = filter.trim().toLowerCase();
    for (const r of rules || []) {
      if (q) {
        const hay = `${r.ruleId} ${r.label} ${(r.scope || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      (out[r.checkType] ||= []).push(r);
    }
    return out;
  }, [rules, filter]);

  const total = (rules || []).length;
  const visible = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  return (
    <Modal open={open} onClose={onClose} width={1040}>
      <div className="flex flex-col max-h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-navy-1">
                Compliance Reference
              </h2>
              <p className="text-[11px] text-muted mt-0.5 font-mono">
                v2 rule catalog · {visible}/{total} rules · grouped by execution tier
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="filter by id, label, scope…"
                className="text-[11px] border border-line rounded px-2 py-1 w-56 focus:outline-none focus:border-navy-1 font-mono"
              />
              <button
                onClick={onClose}
                className="text-muted hover:text-navy-1 px-2 py-1 text-[10px] font-mono uppercase tracking-widest"
              >
                ✕ close
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {TIER.map(tier => {
            const list = grouped[tier.key] || [];
            if (list.length === 0) return null;
            return (
              <section key={tier.key}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${tier.chipCls}`}>
                    TIER · {tier.label.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-muted">{tier.sub}</span>
                  <span className="text-[10px] text-muted font-mono ml-auto">{list.length} rule{list.length === 1 ? '' : 's'}</span>
                </div>
                <table className="w-full text-[11px] border border-line rounded-sm overflow-hidden">
                  <thead className="bg-slate2 border-b border-line">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-mono uppercase tracking-wider text-[9px] text-muted w-[110px]">Rule</th>
                      <th className="px-3 py-2 font-mono uppercase tracking-wider text-[9px] text-muted w-[80px]">Severity</th>
                      <th className="px-3 py-2 font-mono uppercase tracking-wider text-[9px] text-muted">Check</th>
                      <th className="px-3 py-2 font-mono uppercase tracking-wider text-[9px] text-muted w-[140px]">Scope</th>
                      <th className="px-3 py-2 font-mono uppercase tracking-wider text-[9px] text-muted">Authority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map(r => (
                      <tr key={r.ruleId} className="hover:bg-slate2/40 transition-colors align-top">
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-navy-1 font-semibold text-[11px]">{r.ruleId}</div>
                          {r.canonicalField && (
                            <div className="font-mono text-[9px] text-muted mt-0.5">{r.canonicalField}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5"><SeverityChip severity={r.severity} /></td>
                        <td className="px-3 py-2.5 leading-snug">{r.label}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(r.scope || []).map(s => <DocTypeBadge key={s} type={s} />)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(r.ucpRefs || []).map(c => (
                              <CitationChip key={c.id} kind="UCP" cite={c} />
                            ))}
                            {(r.isbpRefs || []).map(c => (
                              <CitationChip key={c.id} kind="ISBP" cite={c} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

          {visible === 0 && (
            <div className="text-center py-12 text-[12px] text-muted">
              No rules match <span className="font-mono">{filter}</span>.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-slate2 text-[10px] text-muted font-mono shrink-0">
          source · rules/catalog.yml × refs/{`{ucp600,isbp821}`}.yaml ·
          ICC Publication No. 600 (2007) · ICC Publication No. 821E (2013)
        </div>
      </div>
    </Modal>
  );
}
