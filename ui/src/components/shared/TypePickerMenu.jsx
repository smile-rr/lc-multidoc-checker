import React from 'react';
import { DOC_TYPES } from '../../constants/docTypes';

/** Dropdown listing all selectable DocTypes (excluding UNKNOWN). */
export function TypePickerMenu({ value, onPick, onCancel }) {
  const options = DOC_TYPES.filter(t => t.id !== 'UNKNOWN');
  return (
    <div
      className="absolute z-50 top-full left-0 mt-1 bg-white border border-line rounded-[6px] shadow-lg py-1 max-h-72 overflow-auto"
      style={{ minWidth: 240 }}
    >
      <div className="px-3 py-1.5 text-[9px] tracking-[0.2em] uppercase text-[#a1a1a6] border-b border-line font-mono">
        SELECT CORRECT TYPE
      </div>
      {options.map(t => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate2 flex items-center gap-2
                      ${t.id === value ? 'bg-status-greenSoft' : ''}`}
        >
          <span style={{ color: t.color }}>{t.icon}</span>
          <span className="font-mono uppercase tracking-wider w-12 text-[10px]" style={{ color: t.color }}>
            {t.short}
          </span>
          <span>{t.name}</span>
        </button>
      ))}
      <button
        onClick={onCancel}
        className="w-full text-left px-3 py-1.5 text-[11px] text-muted border-t border-line hover:bg-slate2"
      >
        Cancel
      </button>
    </div>
  );
}
