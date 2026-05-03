import React from 'react';

/** Page selector strip above the viewer. */
export function PageStrip({ pages, activePage, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="bg-slate2 border-b border-line px-3 py-2 flex items-center gap-2 overflow-x-auto">
      <span className="text-[9px] tracking-[0.2em] uppercase text-[#a1a1a6] mr-1 font-mono">PAGES</span>
      {Array.from({ length: pages }).map((_, i) => {
        const p = i + 1;
        const active = p === activePage;
        return (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-9 h-12 rounded-[3px] border flex flex-col items-center justify-end p-1
              ${active ? 'border-teal-1 bg-white' : 'border-line bg-white hover:border-[#a1a1a6]'}`}
          >
            <div className="flex-1 w-full bg-slate2 rounded-sm mb-1" />
            <span className="text-[8px] font-mono" style={{ color: active ? '#0a7e6a' : '#6e6e73' }}>{p}</span>
          </button>
        );
      })}
      <span className="ml-auto text-[10px] text-muted font-mono">
        <kbd className="px-1.5 py-0.5 border border-line rounded text-[9px]">,</kbd>
        <kbd className="ml-1 px-1.5 py-0.5 border border-line rounded text-[9px]">.</kbd>
        <span className="ml-1">page</span>
        <kbd className="ml-3 px-1.5 py-0.5 border border-line rounded text-[9px]">[</kbd>
        <kbd className="ml-1 px-1.5 py-0.5 border border-line rounded text-[9px]">]</kbd>
        <span className="ml-1">doc</span>
      </span>
    </div>
  );
}
