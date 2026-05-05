import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';

export function RefsPage() {
  const refs = useStore((s) => s.refs);
  const rules = useStore((s) => s.rules);
  const [params] = useSearchParams();
  const initialId = params.get('id');
  const [src, setSrc] = useState(initialId?.startsWith('ISBP') ? 'ISBP821' : 'UCP600');
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState(initialId || null);

  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`ref-${activeId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => clearTimeout(t);
  }, [activeId]);

  const list = src === 'UCP600' ? refs.ucp600 : refs.isbp821;
  const filtered = useMemo(
    () => list.filter((r) => !q || `${r.id} ${r.heading} ${r.text}`.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );

  const usedBy = (refId) =>
    rules.filter((r) => (r.ucp_refs || []).includes(refId) || (r.isbp_refs || []).includes(refId));

  const active = activeId ? list.find((r) => r.id === activeId) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Golden source · read-only</div>
          <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
            UCP 600 &amp; ISBP 821
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Curated paragraphs referenced by rule citations. These are version-locked to
            the published ICC text and are not editable from this console — changes go
            through Legal &amp; Compliance and ship with a service release.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {['UCP600', 'ISBP821'].map((s) => (
              <button
                key={s}
                onClick={() => { setSrc(s); setActiveId(null); }}
                className={`text-xs px-3 py-1.5 rounded border ${
                  src === s ? 'bg-teal-1/10 text-teal-1 border-teal-1/40 font-medium' : 'border-line hover:bg-slate2'
                }`}
              >
                {s}
                <span className="text-[10px] ml-1 opacity-70">
                  ({s === 'UCP600' ? refs.ucp600.length : refs.isbp821.length})
                </span>
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="text-xs px-2 py-1.5 border border-line rounded w-48"
          />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-paper border border-line rounded divide-y divide-line">
          {filtered.map((r) => (
            <button
              key={r.id}
              id={`ref-${r.id}`}
              onClick={() => setActiveId(r.id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate2/50 transition ${
                activeId === r.id ? 'bg-teal-1/10 ring-1 ring-teal-1/30' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                  src === 'UCP600' ? 'bg-status-blueSoft text-status-blue' : 'bg-purple-50 text-purple-700'
                }`}>
                  {r.id}
                </span>
                <span className="text-xs font-medium">{r.heading}</span>
                <span className="ml-auto text-[10px] text-muted">{usedBy(r.id).length} rules</span>
              </div>
              <p className="text-xs text-navy-1 leading-relaxed font-serif line-clamp-2"
                 style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
                {r.text}
              </p>
            </button>
          ))}
        </div>

        <aside className="bg-paper border border-line rounded p-4 sticky top-4 self-start">
          {active ? (
            <>
              <div className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded ${
                src === 'UCP600' ? 'bg-status-blueSoft text-status-blue' : 'bg-purple-50 text-purple-700'
              }`}>
                {active.id}
              </div>
              <h3 className="text-base font-medium mt-2">{active.heading}</h3>
              <blockquote className="mt-3 text-sm font-serif border-l-2 border-line pl-3 leading-relaxed"
                          style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
                "{active.text}"
              </blockquote>
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Referenced by</div>
                <ul className="space-y-1">
                  {usedBy(active.id).map((r) => (
                    <li key={r.rule_id} className="text-xs">
                      <Link to={`/admin/rules/${r.rule_id}`} className="font-mono text-teal-1 hover:underline">
                        {r.rule_id}
                      </Link>
                      <span className="text-muted ml-2">{r.name}</span>
                    </li>
                  ))}
                  {usedBy(active.id).length === 0 && <li className="text-xs text-muted">Not yet cited.</li>}
                </ul>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted">Select a paragraph to see back-references.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
