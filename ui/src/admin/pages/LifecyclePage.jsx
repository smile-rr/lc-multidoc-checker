import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, transitionRule, transitionPrompt, STATES } from '../store';
import { useRole } from '../RoleContext';
import { StateBadge, TierBadge } from '../components/StateBadge';

const COLS = [
  { id: 'DRAFT',     title: 'Draft',     who: 'Compliance · Eng',   desc: 'Authoring; not seen by runtime.' },
  { id: 'IN_REVIEW', title: 'In Review', who: 'Reviewer · Prompt',  desc: 'Peer review; needs approval.' },
  { id: 'SHADOW',    title: 'Shadow',    who: 'Dev / QA',           desc: 'Runs alongside prod; verdict-agreement collected.' },
  { id: 'STAGED',    title: 'Staged',    who: 'Dev / QA',           desc: 'Eval + shadow passed; awaiting publish window.' },
  { id: 'PUBLISHED', title: 'Published', who: 'Runtime',            desc: 'Loaded by the service on next reload.' },
];

export function LifecyclePage() {
  const rules = useStore((s) => s.rules);
  const prompts = useStore((s) => s.prompts);
  const events = useStore((s) => s.lifecycleEvents);
  const users = useStore((s) => s.users);
  const { role } = useRole();
  const [filter, setFilter] = useState('all');

  const items = [
    ...rules.map((r) => ({
      kind: 'rule', id: r.rule_id, label: r.name, state: r.state, type: r.check_type,
      to: `/admin/rules/${r.rule_id}`, owner: r.lastEditedBy,
    })),
    ...prompts.map((p) => ({
      kind: 'prompt', id: p.id, label: p.path, state: p.state, type: p.kind.toUpperCase(),
      to: `/admin/prompts/${encodeURIComponent(p.id)}`, owner: p.lastEditedBy,
    })),
  ].filter((x) => filter === 'all' || x.kind === filter);

  const userById = (id) => users.find((u) => u.id === id);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Release lifecycle</div>
          <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
            DRAFT · REVIEW · STAGED · PUBLISHED
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Rules and prompts version independently but share one release pipeline. A rule
            cannot reach <em>Published</em> while its bound prompt is still in draft.
          </p>
        </div>
        <div className="flex gap-1">
          {['all', 'rule', 'prompt'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded border capitalize ${
                filter === f ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium' : 'border-line hover:bg-slate2'
              }`}
            >{f}s</button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3">
        {COLS.map((col) => {
          const colItems = items.filter((x) => x.state === col.id);
          return (
            <div key={col.id} className="bg-paper border border-line rounded p-3 min-h-[400px]">
              <div className="flex items-center justify-between mb-1">
                <StateBadge state={col.id} />
                <span className="text-[10px] font-mono text-muted">{colItems.length}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted">{col.who}</div>
              <p className="text-[10px] text-muted mb-2 leading-snug">{col.desc}</p>
              <div className="space-y-2">
                {colItems.map((x) => (
                  <Link key={`${x.kind}:${x.id}`} to={x.to}
                        className="block bg-slate2 border border-line rounded p-2 hover:border-teal-1 transition">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                        x.kind === 'rule'
                          ? 'bg-slate-50 text-slate-700 border-slate-300'
                          : 'bg-teal-1/10 text-teal-1 border-teal-1/30'
                      }`}>{x.kind}</span>
                      <span className="text-[10px] font-mono truncate">{x.id}</span>
                    </div>
                    <div className="text-[11px] truncate">{x.label}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <TierBadge type={x.type} />
                      {x.owner && (
                        <span className="text-[9px] text-muted ml-auto">@{userById(x.owner)?.avatar || x.owner}</span>
                      )}
                    </div>
                  </Link>
                ))}
                {colItems.length === 0 && (
                  <div className="text-[10px] text-muted italic py-4 text-center">empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium mb-2">Activity log</h2>
        <div className="bg-paper border border-line rounded divide-y divide-line">
          {events.map((e) => (
            <div key={e.id} className="px-4 py-2 flex items-center gap-3 text-xs">
              <span className="font-mono text-[10px] text-muted w-32 shrink-0">
                {new Date(e.at).toLocaleString()}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted w-14 shrink-0">{e.artifact}</span>
              <Link to={e.artifact === 'rule' ? `/admin/rules/${e.artifactId}` : `/admin/prompts/${encodeURIComponent(e.artifactId)}`}
                    className="font-mono font-medium hover:text-teal-1 w-44 shrink-0 truncate">
                {e.artifactId}
              </Link>
              <span className="flex items-center gap-1 shrink-0">
                {e.from && <StateBadge state={e.from} />}
                <span className="text-muted">→</span>
                <StateBadge state={e.to} />
              </span>
              <span className="text-muted truncate flex-1">{e.note || ''}</span>
              <span className="text-[10px] text-muted shrink-0">@{userById(e.actor)?.name?.split(' ')[0] || e.actor}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
