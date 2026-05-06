import React, { useState } from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SortHeader } from './SortHeader';
import { WorklistRow } from './WorklistRow';

/**
 * Worklist table with three foldable buckets:
 *   Active       — verdicts the officer must triage (PASS/FAIL/DOUBTS/PENDING/NA-applicable)
 *   Not Applicable — rule applied but verdict was NOT_APPLICABLE in this LC
 *   Out of Scope — SKIP'd rules whose doc universe wasn't presented (prefix [OUT_OF_SCOPE])
 */
export function WorklistTable({ groupedActive, groupedNa, groupedOutOfScope,
                                 navMode, sort, setSort, selectedId, onSelect }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead className="bg-white border-b border-line sticky top-0 z-10">
          <tr>
            <SortHeader label="#"        col="seq"      sort={sort} setSort={setSort} width={40} />
            <SortHeader label="Article"  col="article"  sort={sort} setSort={setSort} />
            <SortHeader label="Status"   col="status"   sort={sort} setSort={setSort} width={92} />
            <SortHeader label="Type"     col="tier"     sort={sort} setSort={setSort} width={72} />
            <SortHeader label="Rule"     col="rule"     sort={sort} setSort={setSort} />
            <SortHeader label="Scope"    col="scope"    sort={sort} setSort={setSort} />
            <SortHeader label="Severity" col="severity" sort={sort} setSort={setSort} />
            <SortHeader label="Took"     col="duration" sort={sort} setSort={setSort} width={56} />
          </tr>
        </thead>
        <tbody>
          <ActiveSection grouped={groupedActive} navMode={navMode} selectedId={selectedId} onSelect={onSelect} />
          <FoldableSection
            label={`Not applicable to this LC`}
            grouped={groupedNa}
            navMode={navMode}
            selectedId={selectedId}
            onSelect={onSelect}
            tone="muted"
          />
          <FoldableSection
            label={`Rules not in this presentation's scope`}
            grouped={groupedOutOfScope}
            navMode={navMode}
            selectedId={selectedId}
            onSelect={onSelect}
            tone="muted"
          />
        </tbody>
      </table>
    </div>
  );
}

function ActiveSection({ grouped, navMode, selectedId, onSelect }) {
  return (
    <>
      {Object.entries(grouped).map(([group, items]) => (
        <React.Fragment key={group || '__default__'}>
          {/* Group rows scroll with the data — no nested sticky. In Default
              navMode the group key is "" — suppress the header so the worklist
              reads as one continuous sorted list. */}
          {group !== '' && (
            <tr className="bg-slate2 border-b border-line">
              <td colSpan={8} className="px-3 py-1.5">
                <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-semibold font-mono">
                  {navMode === 'doc' ? (docTypeMeta(group)?.name || group) : group}
                  <span className="ml-2 text-[#a1a1a6] font-normal">
                    {items.length} rule{items.length === 1 ? '' : 's'}
                  </span>
                </span>
              </td>
            </tr>
          )}
          {items.map(rule => (
            <WorklistRow
              key={rule.ruleId}
              rule={rule}
              selected={rule.ruleId === selectedId}
              onClick={() => onSelect(rule.ruleId === selectedId ? null : rule.ruleId)}
            />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

function FoldableSection({ label, grouped, navMode, selectedId, onSelect }) {
  const [open, setOpen] = useState(true);
  const total = Object.values(grouped).reduce((acc, items) => acc + items.length, 0);
  if (total === 0) return null;
  return (
    <>
      <tr className="bg-slate2 border-b border-line">
        <td colSpan={8} className="px-3 py-1.5">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-[10px] tracking-[0.2em] uppercase text-muted font-semibold font-mono hover:text-navy-1"
          >
            {label} ({total}) {open ? '▾' : '▸'}
          </button>
        </td>
      </tr>
      {open && Object.entries(grouped).map(([group, items]) => (
        <React.Fragment key={group}>
          <tr className="bg-white border-b border-line/50">
            <td colSpan={8} className="px-6 py-1">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted font-mono">
                {navMode === 'doc' ? (docTypeMeta(group)?.name || group) : group}
                <span className="ml-2 text-[#a1a1a6] font-normal">{items.length}</span>
              </span>
            </td>
          </tr>
          {items.map(rule => (
            <WorklistRow
              key={rule.ruleId}
              rule={rule}
              selected={rule.ruleId === selectedId}
              onClick={() => onSelect(rule.ruleId === selectedId ? null : rule.ruleId)}
            />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
