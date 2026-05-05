import React from 'react';

export function SortableTH({ children, sortKey, sort, setSort, className = '' }) {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : 'none';
  const next = !active ? 'asc' : sort.dir === 'asc' ? 'desc' : sort.dir === 'desc' ? 'none' : 'asc';
  const click = () => setSort({ key: next === 'none' ? null : sortKey, dir: next });
  const arrow = !active || dir === 'none' ? '⇅' : dir === 'asc' ? '↑' : '↓';
  return (
    <th
      onClick={click}
      className={`text-left px-3 py-2 font-medium select-none cursor-pointer hover:bg-slate2/60 ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={active ? 'text-teal-1' : 'text-muted/50'}>{arrow}</span>
      </span>
    </th>
  );
}

export function useSort(initial = { key: null, dir: 'asc' }) {
  const [sort, setSort] = React.useState(initial);
  const apply = React.useCallback((rows, accessors) => {
    if (!sort.key) return rows;
    const acc = accessors[sort.key] || ((r) => r[sort.key]);
    const sorted = [...rows].sort((a, b) => {
      const av = acc(a); const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), undefined, { numeric: true });
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [sort]);
  return { sort, setSort, apply };
}
