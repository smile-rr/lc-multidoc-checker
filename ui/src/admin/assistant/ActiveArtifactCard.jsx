import React from 'react';
import { Link } from 'react-router-dom';
import { useAssistant } from './AssistantContext';

export function ActiveArtifactCard() {
  const { state } = useAssistant();
  const f = state.lastFocus;
  if (!f) return <div className="rail-empty">no artifact in focus.</div>;

  if (f.kind === 'rule' || f.kind === 'rule.preview') {
    const r = f.payload;
    return (
      <div className="artifact-card">
        <div className="label">{f.kind === 'rule.preview' ? 'rule · preview' : 'rule'}</div>
        <div className="title">{r.rule_id} — {r.name}</div>
        <div className="meta">
          {(r.severity || '—')} · {(r.tier || r.check_type || '—')} · applies to {(r.applies_to || []).join(', ') || '—'}
        </div>
        {r.ucp_refs?.length || r.isbp_refs?.length ? (
          <div className="meta">cites: {[...(r.ucp_refs || []), ...(r.isbp_refs || [])].join(', ')}</div>
        ) : null}
        {f.kind === 'rule' ? (
          <Link className="open-link" to={`/admin/rules/${r.rule_id}`}>open in Rules →</Link>
        ) : null}
      </div>
    );
  }

  if (f.kind === 'session') {
    const s = f.payload;
    return (
      <div className="artifact-card">
        <div className="label">session</div>
        <div className="title">#{s.id} · {s.lc_number}</div>
        <div className="meta">{s.compliant ? 'compliant' : 'non-compliant'} · {s.ruleResults.length} rules ran · {s.fieldCorrections.length} field corrections</div>
      </div>
    );
  }

  if (f.kind === 'ref') {
    const r = f.payload;
    return (
      <div className="artifact-card">
        <div className="label">paragraph</div>
        <div className="title">{r.id}</div>
        <div className="meta">{r.heading}</div>
        <Link className="open-link" to="/admin/refs">open in UCP / ISBP →</Link>
      </div>
    );
  }
  return <div className="rail-empty">artifact in focus: {f.kind}</div>;
}
