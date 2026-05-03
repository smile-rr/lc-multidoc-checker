import React, { useMemo } from 'react';
import { EyebrowLabel } from '../../ui/EyebrowLabel';

/**
 * Read-only MT700 source viewer with line numbers + :tag: highlighting.
 * Sits in place of ParseViewer when the LC entry is selected in DocRail.
 */
export function Mt700TextViewer({ text, warnings = [] }) {
  const lines = useMemo(() => (text || '').split('\n'), [text]);

  if (!text) {
    return (
      <div className="p-8 text-center text-muted text-sm">
        MT700 source not available yet — Parse stage hasn't run.
      </div>
    );
  }

  return (
    <div className="bg-white h-full flex flex-col">
      <div className="px-4 py-2 border-b border-line bg-slate2 flex items-center gap-3">
        <EyebrowLabel>MT700 SOURCE</EyebrowLabel>
        <span className="text-[10px] text-muted font-mono">
          {lines.length} lines · read-only
        </span>
        {warnings.length > 0 && (
          <span className="text-[10px] text-status-gold font-mono ml-auto">
            ⚠ {warnings.length} consistency warning{warnings.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        <pre className="text-[12px] font-mono leading-relaxed">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-slate2/50">
              <span className="text-[10px] text-[#a1a1a6] font-mono select-none w-8 shrink-0 text-right pr-2">
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words">
                {highlightTag(line)}
              </span>
            </div>
          ))}
        </pre>
      </div>
      {warnings.length > 0 && (
        <div className="border-t border-line px-4 py-2 bg-status-goldSoft max-h-32 overflow-auto">
          <EyebrowLabel tone="gold">CONSISTENCY WARNINGS</EyebrowLabel>
          <ul className="mt-1 space-y-0.5 text-[11px] text-status-gold font-mono">
            {warnings.map((w, i) => (
              <li key={i}>· {w.message || w.code || JSON.stringify(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function highlightTag(line) {
  const m = line.match(/^(:\d+[A-Z]?:)(.*)$/);
  if (!m) return line;
  return (
    <>
      <span className="text-teal-1 font-semibold">{m[1]}</span>
      <span className="text-navy-1">{m[2]}</span>
    </>
  );
}
