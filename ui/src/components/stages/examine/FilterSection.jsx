import React from 'react';

export function FilterSection({ title, k, options, filter, setFilter }) {
  const active = filter[k] || [];
  const has = (val) => active.includes(val);
  const toggle = (val) => {
    const set = new Set(active);
    set.has(val) ? set.delete(val) : set.add(val);
    setFilter({ ...filter, [k]: [...set] });
  };
  const clear = () => {
    const f = { ...filter }; delete f[k]; setFilter(f);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-3 mb-1.5">
        <div className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono">{title}</div>
        {active.length > 0 && (
          <button
            onClick={clear}
            title={`Clear ${title} filter`}
            className="text-[8px] tracking-wider px-1 py-0.5 rounded bg-teal-1/10 text-teal-1 hover:bg-teal-1/20 flex items-center gap-1 font-mono"
          >
            {active.length} ON · ✕
          </button>
        )}
      </div>
      {options.map(({ id, label, count, color }) => (
        <button
          key={id}
          onClick={() => toggle(id)}
          className={`w-full flex items-center justify-between px-3 py-1 text-[11px] hover:bg-slate2
            ${has(id) ? 'bg-status-greenSoft' : ''}`}
        >
          <span className="flex items-center gap-2">
            {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
            <span className={has(id) ? 'font-semibold text-teal-1' : 'text-navy-1'}>{label}</span>
          </span>
          {count != null && <span className="text-[#a1a1a6] font-mono">{count}</span>}
        </button>
      ))}
    </div>
  );
}
