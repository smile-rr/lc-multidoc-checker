import React, { useMemo } from 'react';
import { docTypeMeta, compareDocType } from '../../../constants/docTypes';

/**
 * Reconcile matrix — rows × {LC + present docs}.
 *
 * Visual rules:
 *   - LC column is sticky-left, navy border-right (it's the reference)
 *   - Group headers stick to the top of the scroll container
 *   - MATCH cells fade visually (small, neutral); DISCREPANCY pops (red bg, bold)
 *   - Decided cells show their decision badge instead of the raw verdict
 *
 * Click any non-MATCH non-LC cell → onCellClick(fieldKey, docType).
 */
const GROUP_ORDER = ['Identity', 'Money', 'Goods', 'Transport', 'Compliance', 'Insurance', 'Other'];

export function ReconcileMatrix({ rows, docTypes, decisionsByCell, locked, onCellClick, onRowBulk, onColumnBulk, focusedCell, search, filterStatus }) {
  // Sort docTypes by review priority
  const sortedDocs = useMemo(
    () => [...(docTypes || [])].filter(t => t !== 'LC').sort(compareDocType),
    [docTypes]
  );

  // Group rows by group
  const grouped = useMemo(() => {
    const out = {};
    for (const r of rows || []) {
      if (search) {
        const q = search.toLowerCase();
        if (!r.label?.toLowerCase().includes(q) && !r.fieldKey?.toLowerCase().includes(q)) continue;
      }
      if (filterStatus && filterStatus !== 'ALL' && r.verdict !== filterStatus) continue;
      const g = r.group || 'Other';
      (out[g] = out[g] || []).push(r);
    }
    return out;
  }, [rows, search, filterStatus]);

  const groups = GROUP_ORDER.filter(g => grouped[g]?.length > 0);

  if (!rows || rows.length === 0) {
    return (
      <div className="bg-white border border-line rounded-[10px] p-8 text-center text-muted text-sm">
        No reconcile rows yet — Reconcile stage hasn't run.
      </div>
    );
  }

  return (
    <div className="bg-white border border-line rounded-[10px] overflow-hidden h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate2 border-b border-line">
              <th className="sticky left-0 z-30 bg-slate2 px-3 py-2 text-left w-[200px] min-w-[200px] border-r border-line">
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">field</div>
              </th>
              <th className="sticky left-[200px] z-30 bg-slate2 px-3 py-2 text-left w-[180px] min-w-[180px] border-r-2 border-navy-1">
                <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-navy-1 font-semibold">
                  LC ▸ reference
                </div>
              </th>
              {sortedDocs.map(dt => {
                const meta = docTypeMeta(dt);
                return (
                  <th key={dt} className="bg-slate2 px-3 py-2 text-left w-[180px] min-w-[180px] border-r border-line group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold tracking-tight truncate" style={{ color: meta.color }}>
                          {meta.name}
                        </div>
                      </div>
                      {!locked && onColumnBulk && (
                        <button
                          onClick={() => onColumnBulk(dt)}
                          title={`Bulk decisions on ${meta.name}`}
                          className="opacity-0 group-hover:opacity-100 text-[14px] leading-none text-muted hover:text-navy-1 px-1 transition-opacity"
                        >⋯</button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groups.map(g => (
              <React.Fragment key={g}>
                <tr className="bg-slate2/60">
                  <td colSpan={2 + sortedDocs.length} className="sticky left-0 z-10 px-3 py-1.5 border-y border-line">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">{g}</span>
                    <span className="ml-2 text-[10px] text-muted font-mono">{grouped[g].length} fields</span>
                  </td>
                </tr>
                {grouped[g].map(row => (
                  <RowView
                    key={row.fieldKey}
                    row={row}
                    sortedDocs={sortedDocs}
                    decisionsByCell={decisionsByCell}
                    locked={locked}
                    onCellClick={onCellClick}
                    onRowBulk={onRowBulk}
                    focusedCell={focusedCell}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowView({ row, sortedDocs, decisionsByCell, locked, onCellClick, onRowBulk, focusedCell }) {
  const lcVal = row.cells?.LC?.value ?? row.valueByDocType?.LC ?? null;
  const isAttention = row.verdict === 'DISCREPANCY' || row.verdict === 'TOLERANCE' || row.verdict === 'MISSING';
  // Count how many cells in this row need attention — drives the row bulk menu
  const attentionCount = sortedDocs.reduce((n, dt) => {
    const v = row.cells?.[dt]?.verdict;
    return (v === 'DISCREPANCY' || v === 'TOLERANCE' || v === 'MISSING') ? n + 1 : n;
  }, 0);

  return (
    <tr className={`border-b border-line/60 group ${isAttention ? 'bg-status-redSoft/20' : 'hover:bg-slate2/40'}`}>
      <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top border-r border-line">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-navy-1 truncate">{row.label || row.fieldKey}</div>
          </div>
          {!locked && onRowBulk && attentionCount > 1 && (
            <button
              onClick={() => onRowBulk(row)}
              title={`Bulk decision on ${attentionCount} cells in this row`}
              className="opacity-0 group-hover:opacity-100 text-[14px] leading-none text-muted hover:text-navy-1 px-1 transition-opacity"
            >⋯</button>
          )}
        </div>
      </td>
      {/* LC reference (read-only, frozen) */}
      <td className="sticky left-[200px] z-10 bg-white px-3 py-2 align-top border-r-2 border-navy-1">
        <div className="text-[12px] text-navy-1 font-mono break-words">
          {lcVal != null && lcVal !== '' ? lcVal : <span className="text-[#a1a1a6]">—</span>}
        </div>
        <div className="text-[9px] tracking-wider uppercase text-navy-1/60 font-mono mt-0.5">REF</div>
      </td>
      {sortedDocs.map(dt => {
        const cell = row.cells?.[dt];
        const decision = decisionsByCell.get(`${row.fieldKey}|${dt}`);
        const isFocused = focusedCell?.fieldKey === row.fieldKey && focusedCell?.docType === dt;
        return (
          <CellView
            key={dt}
            row={row}
            docType={dt}
            cell={cell}
            decision={decision}
            locked={locked}
            focused={isFocused}
            onClick={() => onCellClick?.(row, dt)}
          />
        );
      })}
    </tr>
  );
}

function CellView({ row, docType, cell, decision, locked, focused, onClick }) {
  const focusRing = focused ? 'ring-2 ring-navy-1 ring-inset' : '';
  if (!cell) {
    return <td className="px-3 py-2 align-top border-r border-line/60 text-[11px] text-[#c0c4cc]">—</td>;
  }
  const v = cell.verdict || 'NA';
  const value = cell.value;

  // Officer-decided cells override the verdict visual.
  // For 'edited' decisions: display the *edited* value (the officer's correction),
  // not the stale extracted value. Other decisions show the original value with
  // the decision badge and color tone.
  if (decision) {
    const isEdited = decision.decision === 'edited';
    const displayValue = isEdited && decision.value != null && decision.value !== ''
      ? decision.value
      : value;
    const tone = decision.decision === 'accept_match' ? 'green'
      : decision.decision === 'genuine' ? 'red'
      : decision.decision === 'parse_error' ? 'gold'
      : isEdited ? 'blue'
      : 'gray';
    const toneCls = {
      green: 'bg-status-greenSoft text-status-green',
      red:   'bg-status-redSoft text-status-red',
      gold:  'bg-status-goldSoft text-status-gold',
      blue:  'bg-status-blueSoft text-status-blue border-l-2 border-l-status-blue',
      gray:  'bg-slate2 text-muted',
    }[tone];
    const editedFromHint = isEdited && value != null && String(value) !== String(displayValue)
      ? `was: ${value}`
      : null;
    return (
      <td
        onClick={!locked ? onClick : undefined}
        className={`px-3 py-2 align-top border-r border-line/60 cursor-pointer transition-colors ${toneCls} ${focusRing}`}
        title={decision.note || (editedFromHint ?? decision.decision)}
      >
        <div className="text-[12px] font-mono break-words">
          {displayValue != null && displayValue !== '' ? displayValue : <span className="opacity-50">—</span>}
        </div>
        <div className="text-[9px] uppercase tracking-wider font-mono mt-0.5 flex items-center gap-1">
          <span>✓ {decision.decision.replace('_', ' ')}</span>
          {editedFromHint && (
            <span className="text-status-blue/60 normal-case tracking-normal truncate max-w-[120px]">
              · {editedFromHint}
            </span>
          )}
        </div>
      </td>
    );
  }

  // Verdict-based visual
  const verdictCls = v === 'MATCH'       ? ''
    : v === 'TOLERANCE'   ? 'bg-status-goldSoft/40 border-b-2 border-b-status-gold'
    : v === 'DISCREPANCY' ? 'bg-status-redSoft text-status-red'
    : v === 'MISSING'     ? 'bg-status-redSoft/60'
    : 'bg-slate2/40';

  const isMatch = v === 'MATCH';
  const isNa = v === 'NA';
  const clickable = !locked && !isMatch && !isNa;

  return (
    <td
      onClick={clickable ? onClick : undefined}
      className={`px-3 py-2 align-top border-r border-line/60 transition-colors
        ${verdictCls} ${focusRing} ${clickable ? 'cursor-pointer hover:brightness-95' : ''}`}
      title={cell.detail || ''}
    >
      {isNa ? (
        <span className="text-[11px] text-[#c0c4cc]">—</span>
      ) : v === 'MISSING' ? (
        <div>
          <div className="text-[11px] text-status-red font-mono">⌀ missing</div>
          {cell.detail && <div className="text-[9px] text-status-red/70 mt-0.5 font-mono">{cell.detail}</div>}
        </div>
      ) : (
        <div>
          <div className={`text-[12px] font-mono break-words ${v === 'DISCREPANCY' ? 'font-semibold' : 'text-navy-1'}`}>
            {value != null && value !== '' ? value : <span className="text-[#a1a1a6]">—</span>}
          </div>
          {cell.detail && (
            <div className={`text-[9px] mt-0.5 font-mono ${v === 'DISCREPANCY' ? 'text-status-red/70' : 'text-status-gold/80'}`}>
              {cell.detail}
            </div>
          )}
        </div>
      )}
    </td>
  );
}
