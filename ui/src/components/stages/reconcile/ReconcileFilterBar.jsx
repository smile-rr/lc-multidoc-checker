import React from 'react';

const FILTERS = [
  ['ALL',         'All',           null],
  ['MATCH',       'Match',         '#1a7a43'],
  ['DISCREPANCY', 'Discrepancies', '#cc0011'],
  ['TOLERANCE',   'Within tol.',   '#0066cc'],
];

export function ReconcileFilterBar({ counts, filter, setFilter, search, setSearch,
                                     onExpandAll, onCollapseAll, onReset, totalFields, totalDocs }) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted mr-1 font-mono">FILTER</span>
      {FILTERS.map(([id, label, dot]) => {
        const active = filter === id;
        const n = id === 'ALL' ? null : (counts?.[id] ?? 0);
        return (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] border font-mono
              ${active ? 'bg-navy-1 text-white border-navy-1' : 'bg-white border-line hover:bg-slate2'}`}
          >
            {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
            {label}{n !== null ? ` ${n}` : ''}
          </button>
        );
      })}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search canonical field…"
        className="ml-2 px-2.5 py-1 border border-line rounded-[6px] text-[11px] bg-white font-mono"
        style={{ width: 200 }}
      />
      <button onClick={onExpandAll} className="text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-slate2 font-mono">Expand all</button>
      <button onClick={onCollapseAll} className="text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-slate2 font-mono">Collapse all</button>
      <button onClick={onReset} className="text-[10px] px-2 py-1 rounded text-muted hover:bg-slate2 font-mono">↻ Reset view</button>
      <span className="ml-auto text-[11px] text-muted font-mono">
        {totalFields} canonical fields × {totalDocs} documents
      </span>
    </div>
  );
}
