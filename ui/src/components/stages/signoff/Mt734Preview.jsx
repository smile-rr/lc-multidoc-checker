import React from 'react';

export function Mt734Preview({ open, onToggle, advice, loading }) {
  return (
    <div className="bg-white border border-status-red rounded-[10px]">
      <div className="px-4 py-2.5 border-b border-status-red bg-status-redSoft flex items-center justify-between">
        <div className="text-[10px] tracking-[0.2em] uppercase text-status-red font-semibold font-mono">
          MT734 · ADVICE OF REFUSAL
        </div>
        <button onClick={onToggle} className="text-[10px] text-status-red">
          {open ? 'hide' : 'preview'}
        </button>
      </div>
      {open && (
        <pre className="p-3 text-[10px] leading-[1.6] overflow-auto font-mono">
          {loading ? 'Loading MT734 preview…' : (advice || '(empty)')}
        </pre>
      )}
    </div>
  );
}
