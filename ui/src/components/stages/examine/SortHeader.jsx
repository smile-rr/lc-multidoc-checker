import React from 'react';

export function SortHeader({ label, col, sort, setSort, width }) {
  const active = sort.col === col;
  const dir = active ? sort.dir : null;
  const onClick = () => {
    if (!col) return;
    if (!active) setSort({ col, dir: 'desc' });
    else if (dir === 'desc') setSort({ col, dir: 'asc' });
    else setSort({ col: null, dir: null });
  };
  return (
    <th
      onClick={col ? onClick : undefined}
      style={{ width }}
      className={`px-2 py-2 text-left font-normal text-[9px] tracking-wider uppercase font-mono
        ${col ? 'cursor-pointer hover:bg-slate2' : ''}
        ${active ? 'text-navy-1' : 'text-muted'}`}
    >
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        {col && (
          <span className={`text-[8px] ${active ? 'text-teal-1' : 'text-line'}`}>
            {!active ? '↕' : dir === 'desc' ? '▼' : '▲'}
          </span>
        )}
      </span>
    </th>
  );
}
