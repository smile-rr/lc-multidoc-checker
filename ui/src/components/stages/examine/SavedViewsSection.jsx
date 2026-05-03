import React from 'react';

export function SavedViewsSection({ views, activeId, onApply, onSave, onDelete, hasStateForSave }) {
  return (
    <div className="bg-slate2 border-b border-line py-3 px-2">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="text-[9px] tracking-[0.2em] uppercase text-navy-1 font-semibold flex items-center gap-1.5 font-mono">
          <span>★</span><span>SAVED VIEWS</span>
        </div>
        <span className="text-[8px] text-[#a1a1a6] font-mono">{views.length}</span>
      </div>
      <div className="space-y-1">
        {views.map(v => {
          const isActive = activeId === v.id;
          return (
            <div
              key={v.id}
              className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] border
                ${isActive ? 'border-teal-1 bg-white shadow-sm' : 'border-transparent bg-white hover:border-line'}`}
            >
              <button
                onClick={() => onApply(v)}
                className="flex-1 text-left flex items-center gap-1.5"
                title={`Apply view`}
              >
                <span className="text-[10px]" style={{ color: isActive ? '#0a7e6a' : '#a1a1a6' }}>
                  {v.builtin ? '◆' : '★'}
                </span>
                <span className={`text-[11px] truncate ${isActive ? 'font-semibold text-teal-1' : 'text-navy-1'}`}>
                  {v.name}
                </span>
              </button>
              {!v.builtin && (
                <button
                  onClick={() => onDelete(v.id)}
                  title="Delete view"
                  className="opacity-0 group-hover:opacity-100 text-[#a1a1a6] hover:text-status-red text-[11px]"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onSave}
        disabled={!hasStateForSave}
        title="Save current filters + group-by + sort as a named view"
        className={`mt-2 w-full text-[10px] tracking-wider px-2 py-1.5 rounded-[6px] border font-mono
          ${hasStateForSave
            ? 'border-navy-1 text-navy-1 hover:bg-navy-1 hover:text-white'
            : 'border-line text-[#a1a1a6] cursor-not-allowed'}`}
      >
        + SAVE CURRENT VIEW
      </button>
      <div className="mt-1.5 text-[9px] text-[#a1a1a6] px-1 leading-snug">
        Saves filters · grouping · sort. Officer overrides persist regardless of view.
      </div>
    </div>
  );
}
