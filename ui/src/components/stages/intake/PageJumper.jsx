import React, { useState } from 'react';

/** Compact prev/next + page input for the deal bundle viewer. */
export function PageJumper({ page, pages, onPage }) {
  if (!pages || pages < 1) return null;

  const go = (p) => {
    const n = Math.max(1, Math.min(pages, p));
    if (n !== page) onPage(n);
  };

  const [draft, setDraft] = useState(String(page));
  React.useEffect(() => { setDraft(String(page)); }, [page]);

  const commitDraft = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) go(n);
    else setDraft(String(page));
  };

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted shrink-0">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="w-7 h-7 rounded border border-line bg-white hover:border-[#a1a1a6] disabled:opacity-30"
        title="Previous page (,)"
      >
        ‹
      </button>
      <span className="text-[10px] text-[#a1a1a6]">Page</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(); } }}
        className="w-9 h-7 text-center border border-line rounded bg-white text-navy-1 text-[11px]"
        aria-label="Current page"
      />
      <span className="text-[10px] text-[#a1a1a6]">/ {pages}</span>
      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        className="w-7 h-7 rounded border border-line bg-white hover:border-[#a1a1a6] disabled:opacity-30"
        title="Next page (.)"
      >
        ›
      </button>
    </div>
  );
}
