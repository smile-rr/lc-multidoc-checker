import React, { useState } from 'react';

/**
 * Read-only display of ad-hoc rules proposed by the planner. Shows officers
 * what was discovered in :46A:/:47A: clauses BEFORE the worklist verdicts
 * are populated. Once review phase starts, collapses to a one-liner.
 */
export function PlanReviewPane({ adhocRules, collapsedByDefault }) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const list = adhocRules || [];
  if (list.length === 0) return null;

  if (!expanded) {
    return (
      <div className="bg-slate2 border-b border-line px-6 py-2 flex items-center gap-3 text-[11px] font-mono">
        <span className="text-status-gold">✦ AI Plan · {list.length} rule{list.length === 1 ? '' : 's'} suggested from LC text</span>
        <span className="text-muted">— see worklist</span>
        <button
          className="ml-auto text-muted hover:text-navy-1 underline-offset-2 hover:underline"
          onClick={() => setExpanded(true)}
        >
          [expand]
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate2 border-b border-line px-6 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">✦ AI PLAN · LC-DERIVED RULES</span>
        <span className="text-[10px] font-mono text-status-gold">{list.length} suggested</span>
        {collapsedByDefault && (
          <button
            className="ml-auto text-[10px] font-mono text-muted hover:text-navy-1"
            onClick={() => setExpanded(false)}
          >
            [collapse]
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map((r, i) => (
          <AdhocCard key={(r.rule_id || r.ruleId || i)} rule={r} />
        ))}
      </div>
    </div>
  );
}

function AdhocCard({ rule }) {
  const id = rule.rule_id || rule.ruleId;
  const label = rule.label || rule.description || id;
  const evidence = rule.evidenceLcClause || rule.evidence_lc_clause;
  const severity = rule.severity || 'MINOR';
  const ucp = rule.ucpRefs || rule.ucp_refs || [];
  const isbp = rule.isbpRefs || rule.isbp_refs || [];
  return (
    <div className="rounded border border-line bg-white px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-mono font-semibold bg-status-gold/20 text-status-gold border border-status-gold/40 px-1 py-0.5 rounded">
          AH
        </span>
        <span className="text-[10px] font-mono text-muted">{id}</span>
        <span className="ml-auto text-[9px] font-mono text-muted">{severity}</span>
      </div>
      <div className="text-[11px] leading-snug text-navy-1">{label}</div>
      {evidence && (
        <div className="mt-1 text-[10px] font-mono text-muted line-clamp-2" title={evidence}>
          “{evidence.length > 90 ? evidence.slice(0, 90) + '…' : evidence}”
        </div>
      )}
      {(ucp.length > 0 || isbp.length > 0) && (
        <div className="mt-1 text-[9px] font-mono text-teal-1">
          {ucp.join(' · ')}{ucp.length && isbp.length ? ' · ' : ''}{isbp.join(' · ')}
        </div>
      )}
    </div>
  );
}
