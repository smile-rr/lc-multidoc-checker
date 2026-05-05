import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { StateBadge } from '../components/StateBadge';

const Stat = ({ label, value, sub }) => (
  <div className="bg-paper border border-line rounded p-4">
    <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    <div className="text-2xl font-serif mt-1" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{value}</div>
    {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
  </div>
);

export function DashboardPage() {
  const rules = useStore((s) => s.rules);
  const prompts = useStore((s) => s.prompts);
  const events = useStore((s) => s.lifecycleEvents);
  const refs = useStore((s) => s.refs);

  const byState = (xs) => xs.reduce((m, x) => ({ ...m, [x.state]: (m[x.state] || 0) + 1 }), {});
  const rs = byState(rules);
  const ps = byState(prompts);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <section>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">Two lanes · one runtime</div>
        <div className="grid grid-cols-2 gap-4">
          <Lane
            color="bg-navy-2"
            title="Compliance lane"
            who="Compliance Lead · Reviewer"
            owns="Rule meaning, severity, polarity, citations to UCP 600 / ISBP 821."
            states={rs}
            link="/admin/rules"
            linkLabel={`${rules.length} rules`}
          />
          <Lane
            color="bg-teal-1"
            title="Engineering lane"
            who="Prompt Engineer · Dev / QA"
            owns="Prompt templates that consume rule context at runtime; system + extraction prompts."
            states={ps}
            link="/admin/prompts"
            linkLabel={`${prompts.length} prompts`}
          />
        </div>
      </section>

      <section className="grid grid-cols-4 gap-4">
        <Stat label="UCP 600 articles" value={refs.ucp600.length} sub="Read-only golden source" />
        <Stat label="ISBP 821 paragraphs" value={refs.isbp821.length} sub="Read-only golden source" />
        <Stat label="Active drafts" value={(rs.DRAFT || 0) + (ps.DRAFT || 0)} sub="Cross both lanes" />
        <Stat label="Awaiting review" value={(rs.IN_REVIEW || 0) + (ps.IN_REVIEW || 0)} />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <Link to="/admin/lifecycle" className="text-xs text-teal-1 hover:underline">See release board →</Link>
        </div>
        <div className="bg-paper border border-line rounded divide-y divide-line">
          {events.slice(0, 8).map((e) => (
            <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
              <span className="font-mono text-[10px] text-muted w-32 shrink-0">
                {new Date(e.at).toLocaleString()}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">
                {e.artifact}
              </span>
              <Link
                to={e.artifact === 'rule' ? `/admin/rules/${e.artifactId}` : `/admin/prompts/${encodeURIComponent(e.artifactId)}`}
                className="font-mono font-medium hover:text-teal-1 w-44 shrink-0 truncate"
              >
                {e.artifactId}
              </Link>
              <span className="flex items-center gap-1.5 shrink-0">
                {e.from && <StateBadge state={e.from} />}
                <span className="text-muted">→</span>
                <StateBadge state={e.to} />
              </span>
              <span className="text-muted truncate flex-1">{e.note || ''}</span>
              <span className="text-[10px] text-muted shrink-0">@{e.actor}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Lane({ color, title, who, owns, states, link, linkLabel }) {
  return (
    <div className="bg-paper border border-line rounded p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5 align-middle`} />
          <span className="text-sm font-medium">{title}</span>
          <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">{who}</div>
        </div>
        <Link to={link} className="text-[11px] text-teal-1 hover:underline">{linkLabel} →</Link>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-3">{owns}</p>
      <div className="flex gap-1 flex-wrap">
        {['DRAFT', 'IN_REVIEW', 'STAGED', 'PUBLISHED'].map((s) => (
          <span key={s} className="flex items-center gap-1 text-[10px]">
            <StateBadge state={s} />
            <span className="font-mono">{states[s] || 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
