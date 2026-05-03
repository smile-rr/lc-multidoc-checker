import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { GROUP_ORDER } from '../../../constants/reconcileGroups';

const VERDICT_TONE = {
  DISCREPANCY: 'bg-[#fff8f8]',
  TOLERANCE:   'bg-[#f7faff]',
  MATCH:       '',
  NA:          '',
};

const VERDICT_LABEL = {
  MATCH:       { c: '#1a7a43', bg: '#f0fdf4', l: 'MATCH' },
  DISCREPANCY: { c: '#cc0011', bg: '#fff1f0', l: 'DISCREPANCY' },
  TOLERANCE:   { c: '#0066cc', bg: '#eff6ff', l: 'WITHIN TOL.' },
  NA:          { c: '#6e6e73', bg: '#f5f5f7', l: '—' },
};

function VerdictBadge({ v }) {
  const m = VERDICT_LABEL[v] || VERDICT_LABEL.NA;
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded tracking-wider uppercase font-semibold font-mono"
      style={{ color: m.c, background: m.bg }}
    >
      {m.l}
    </span>
  );
}

export function PivotTable({ visibleByGroup, docTypes, docMap, locked, triage, onTriage, onJumpToParse, collapsed, onToggleGroup }) {
  return (
    <div className="bg-white border border-line rounded-[10px] overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        <table className="w-full text-[11px]">
          <thead className="bg-slate2 border-b border-line sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 font-normal text-[10px] tracking-wider uppercase text-muted font-mono"
                  style={{ width: 220 }}>
                Canonical field
              </th>
              {docTypes.map(typeId => {
                const t = docTypeMeta(typeId);
                const d = docMap[typeId];
                return (
                  <th
                    key={typeId}
                    title={d?.original_filename}
                    className="text-left px-3 py-3 font-normal text-[10px] tracking-wider uppercase border-l border-line/50 font-mono"
                    style={{ color: t.color, minWidth: 160 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t.icon}</span>
                      <span>{t.short}</span>
                    </div>
                    <div className="text-[8px] mt-0.5 text-[#a1a1a6] truncate font-normal" style={{ maxWidth: 150 }}>
                      {d?.original_filename || ''}
                    </div>
                  </th>
                );
              })}
              <th className="text-left px-3 py-3 font-normal text-[10px] tracking-wider uppercase text-muted border-l border-line/50 font-mono"
                  style={{ width: 110 }}>
                Verdict
              </th>
              <th className="text-left px-3 py-3 font-normal text-[10px] tracking-wider uppercase text-muted border-l border-line/50 font-mono"
                  style={{ width: 200 }}>
                Officer triage
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleByGroup.length === 0 && (
              <tr>
                <td colSpan={docTypes.length + 3} className="px-4 py-6 text-center text-[12px] text-muted">
                  No fields match filter.
                </td>
              </tr>
            )}
            {visibleByGroup.map(([group, items]) => {
              const c = countsForGroup(items);
              const isCollapsed = collapsed[group];
              return (
                <React.Fragment key={group}>
                  <tr className="bg-slate2 border-b border-line sticky top-[44px] z-[5]">
                    <td colSpan={docTypes.length + 3}>
                      <button
                        onClick={() => onToggleGroup(group)}
                        className="w-full text-left px-4 py-2 hover:bg-line/30 flex items-center gap-2"
                      >
                        <span className="text-muted text-[11px] w-3">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="text-[11px] tracking-tight font-semibold">{group}</span>
                        <span className="text-[10px] text-[#a1a1a6] font-mono">{items.length}</span>
                        <span className="ml-auto flex items-center gap-2 text-[10px] font-mono">
                          {c.MATCH > 0 && <span className="flex items-center gap-1 text-status-green"><span className="w-1.5 h-1.5 rounded-full bg-status-green" />{c.MATCH} match</span>}
                          {c.DISCREPANCY > 0 && <span className="flex items-center gap-1 text-status-red"><span className="w-1.5 h-1.5 rounded-full bg-status-red" />{c.DISCREPANCY} discrep.</span>}
                          {c.TOLERANCE > 0 && <span className="flex items-center gap-1 text-status-blue"><span className="w-1.5 h-1.5 rounded-full bg-status-blue" />{c.TOLERANCE} within tol.</span>}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed && items.map(field => {
                    const tone = VERDICT_TONE[field.verdict] || '';
                    const tri = triage[field.fieldKey];
                    return (
                      <React.Fragment key={field.fieldKey}>
                        <tr className={`border-b border-line/50 hover:bg-slate2 ${tone}`}>
                          <td className="px-4 py-3 align-top">
                            <div className="text-[12px] font-medium">{field.label || field.fieldKey}</div>
                            {field.article && (
                              <div className="text-[9px] text-muted mt-0.5 font-mono">{field.article}</div>
                            )}
                          </td>
                          {docTypes.map(typeId => {
                            const v = field.valueByDocType?.[typeId];
                            const isAnomaly = field.verdict === 'DISCREPANCY' && v != null
                              && firstNonNull(field.valueByDocType, docTypes) !== v;
                            return (
                              <td
                                key={typeId}
                                className={`px-3 py-3 align-top border-l border-line/50 text-[11px] font-mono
                                  ${isAnomaly ? 'text-status-red font-semibold' : ''}`}
                              >
                                {v != null ? String(v) : <span className="text-line">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 align-top border-l border-line/50">
                            <VerdictBadge v={field.verdict} />
                          </td>
                          <td className="px-3 py-3 align-top border-l border-line/50">
                            {(field.verdict === 'DISCREPANCY' || field.verdict === 'TOLERANCE')
                              ? (locked
                                  ? <div className="text-[10px] font-mono">
                                      {tri === 'genuine'
                                        ? <span className="text-status-red">• GENUINE — carry forward</span>
                                        : tri === 'parse-error'
                                        ? <span className="text-status-blue">• PARSE ERROR — corrected</span>
                                        : <span className="text-[#a1a1a6]">—</span>}
                                    </div>
                                  : tri
                                    ? <div className="flex items-center gap-1.5">
                                        {tri === 'genuine'
                                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-redSoft text-status-red border border-[#fcc] font-mono">GENUINE</span>
                                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-blueSoft text-status-blue border border-[#cfe0fa] font-mono">PARSE ERROR</span>}
                                        <button onClick={() => onTriage(field.fieldKey, null)}
                                                className="text-[9px] text-muted hover:text-navy-1 underline font-mono">
                                          reset
                                        </button>
                                      </div>
                                    : <div className="flex flex-col gap-1">
                                        <button
                                          onClick={() => onTriage(field.fieldKey, 'genuine')}
                                          className="text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-status-redSoft hover:border-status-red text-left font-mono"
                                        >
                                          • Mark genuine
                                        </button>
                                        <button
                                          onClick={() => { onTriage(field.fieldKey, 'parse-error'); onJumpToParse?.(field.fieldKey); }}
                                          className="text-[10px] px-2 py-1 rounded border border-line bg-white hover:bg-status-blueSoft hover:border-status-blue text-left font-mono"
                                        >
                                          → Re-open in Parse
                                        </button>
                                      </div>)
                              : <span className="text-line text-[10px] font-mono">n/a</span>}
                          </td>
                        </tr>
                        {field.discrepancyDetail && (
                          <tr className={tone}>
                            <td colSpan={docTypes.length + 3} className="px-4 pb-3 pt-0 text-[11px] text-muted">
                              <span className="text-[#a1a1a6] font-mono">↳ note · </span>{field.discrepancyDetail}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function countsForGroup(items) {
  return items.reduce((a, f) => {
    a[f.verdict] = (a[f.verdict] || 0) + 1;
    return a;
  }, {});
}

function firstNonNull(map, keys) {
  if (!map) return null;
  for (const k of keys) {
    const v = map[k];
    if (v != null) return v;
  }
  return null;
}
