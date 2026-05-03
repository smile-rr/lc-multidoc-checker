import React from 'react';
import { docTypeMeta } from '../../../constants/docTypes';
import { SortHeader } from './SortHeader';
import { WorklistRow } from './WorklistRow';

export function WorklistTable({ grouped, navMode, sort, setSort, selectedId, onSelect }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead className="bg-white border-b border-line sticky top-0 z-10">
          <tr>
            <SortHeader label=""         col="status"   sort={sort} setSort={setSort} width={32} />
            <SortHeader label="Article"  col="article"  sort={sort} setSort={setSort} />
            <SortHeader label="Scope"    col="scope"    sort={sort} setSort={setSort} />
            <SortHeader label="Rule"     col="rule"     sort={sort} setSort={setSort} />
            <SortHeader label="Severity" col="severity" sort={sort} setSort={setSort} />
            <SortHeader label="Source"   col="source"   sort={sort} setSort={setSort} />
            <SortHeader label="Agree"    col="agree"    sort={sort} setSort={setSort} />
            <SortHeader label="Reliab."  col="reliab"   sort={sort} setSort={setSort} />
            <SortHeader label="Flags"    col={null}     sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([group, items]) => (
            <React.Fragment key={group}>
              <tr className="bg-slate2 border-b border-line sticky top-[36px] z-[5]">
                <td colSpan={9} className="px-3 py-1.5">
                  <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-semibold font-mono">
                    {navMode === 'doc' ? (docTypeMeta(group)?.name || group) : group}
                    <span className="ml-2 text-[#a1a1a6] font-normal">
                      {items.length} rule{items.length === 1 ? '' : 's'}
                    </span>
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
        </tbody>
      </table>
    </div>
  );
}
