import React from 'react';
import { FilterSection } from './FilterSection';
import { SavedViewsSection } from './SavedViewsSection';
import { docTypeMeta } from '../../../constants/docTypes';

const STATUS_COLORS = {
  PASS:           '#1a7a43',
  FAIL:           '#cc0011',
  DOUBTS:         '#8a5700',
  NOT_APPLICABLE: '#6e6e73',
  FAILED:         '#b54708',
};
const SEV_COLORS = {
  CRITICAL:    '#cc0011',
  MAJOR:       '#cc0011',
  MINOR:       '#8a5700',
  OBSERVATION: '#0066cc',
};

export function FilterRail({ rules, filter, setFilter, savedViews, applyView, saveCurrent, deleteView, activeView, hasStateForSave, collapsed, onToggleCollapsed }) {
  // Active filter count (for the badge shown when collapsed).
  const activeCount = Object.values(filter || {}).reduce((n, set) =>
    n + (set instanceof Set ? set.size : (Array.isArray(set) ? set.length : 0)), 0);

  // Same toggle style for both collapsed/expanded — top-right of the sidebar,
  // intentionally low-contrast so it doesn't compete with the worklist.
  const toggleBtnClass = "w-5 h-5 rounded text-[#c0c4cc] hover:text-muted flex items-center justify-center transition-colors flex-shrink-0";

  if (collapsed) {
    return (
      <aside className="bg-white border-r border-line flex-shrink-0 flex flex-col items-center py-2 gap-2" style={{ width: 40 }}>
        <button
          onClick={onToggleCollapsed}
          className={toggleBtnClass}
          title="Show filter rail"
          aria-label="Show filter rail"
        >
          <span className="text-[12px] leading-none font-mono">&gt;</span>
        </button>
        <button
          onClick={onToggleCollapsed}
          className="flex flex-col items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase text-muted font-mono py-2 hover:text-navy-1"
          title={`Filters · ${activeCount} active`}
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          <span>⌕ FILTERS</span>
          {activeCount > 0 && (
            <span className="px-1 rounded bg-navy-1 text-white tabular-nums">{activeCount}</span>
          )}
        </button>
      </aside>
    );
  }
  const docs = [...new Set(rules.flatMap(r => r.scope || []))].sort();

  const statusOpts = ['PASS', 'FAIL', 'DOUBTS', 'FAILED', 'NOT_APPLICABLE'].map(s => ({
    id: s, label: s.replace('_', ' '),
    count: rules.filter(r => (r.effectiveVerdict || r.verdict) === s).length,
    color: STATUS_COLORS[s],
  }));
  const sevOpts = ['CRITICAL', 'MAJOR', 'MINOR', 'OBSERVATION'].map(s => ({
    id: s, label: s,
    count: rules.filter(r => r.severity === s).length,
    color: SEV_COLORS[s],
  }));
  const attentionOpts = [
    ['LOW-CONF-PASS',    'Low-conf passes'],
    ['SPLIT',            'Split agreement'],
    ['AGENT-DISAGREE',   'Agent disagreement'],
    ['HANDWRITING',      'Handwriting'],
    ['AGENT-UNRELIABLE', 'Unreliable agent'],
    ['OVERRIDDEN',       'Overridden'],
    ['FLAGGED',          'Flagged'],
  ].map(([id, label]) => ({
    id, label,
    count: rules.filter(r => (r.attention || []).includes(id)).length,
  }));
  // The `source` axis describes WHICH ENGINE evaluated the rule
  // (Programmatic SpEL, plain Agent prompt, or Agent+Tool callback).
  // Provenance (catalog vs ad-hoc / planner-generated) is a separate axis,
  // surfaced via the Origin filter below.
  const sourceOpts = [
    ['PROG',       'Programmatic'],
    ['AGENT',      'Agent'],
    ['AGENT+TOOL', 'Agent + tool'],
  ].map(([id, label]) => ({
    id, label,
    count: rules.filter(r => r.source === id).length,
  }));
  const docOpts = docs.map(d => {
    const t = docTypeMeta(d);
    return {
      id: d, label: t.short,
      count: rules.filter(r => (r.scope || []).includes(d)).length,
    };
  });
  const originOpts = [
    ['CATALOG', 'Catalog'],
    ['ADHOC',   'AI Plan'],
  ].map(([id, label]) => ({
    id, label,
    count: rules.filter(r => (r.origin || 'CATALOG') === id).length,
    color: id === 'ADHOC' ? '#8a5700' : '#0066cc',
  }));
  const adhocCount = rules.filter(r => r.origin === 'ADHOC').length;
  const showAdhocOnly = () => setFilter({ ...filter, origin: ['ADHOC'] });

  return (
    <aside className="bg-white border-r border-line overflow-auto flex-shrink-0 flex flex-col" style={{ width: 240 }}>
      {onToggleCollapsed && (
        <div className="flex justify-end px-2 pt-2">
          <button
            onClick={onToggleCollapsed}
            className={toggleBtnClass}
            title="Hide filter rail"
            aria-label="Hide filter rail"
          >
            <span className="text-[12px] leading-none font-mono">&lt;</span>
          </button>
        </div>
      )}
      <SavedViewsSection
        views={savedViews}
        activeId={activeView}
        onApply={applyView}
        onSave={saveCurrent}
        onDelete={deleteView}
        hasStateForSave={hasStateForSave}
      />
      <div className="py-3 flex-1">
        <div className="px-3 mb-2 flex items-center gap-1.5">
          <span className="text-[9px] tracking-[0.2em] uppercase text-navy-1 font-semibold flex items-center gap-1.5 font-mono">
            <span>⌕</span><span>FILTERS</span>
            {activeCount > 0 && (
              <span className="px-1 rounded bg-navy-1 text-white tabular-nums">{activeCount}</span>
            )}
          </span>
        </div>
        <FilterSection title="Status"          k="status"    options={statusOpts}    filter={filter} setFilter={setFilter} />
        <FilterSection title="Severity"        k="severity"  options={sevOpts}       filter={filter} setFilter={setFilter} />
        <FilterSection title="Need attention"  k="attention" options={attentionOpts} filter={filter} setFilter={setFilter} />
        <FilterSection title="Source"          k="source"    options={sourceOpts}    filter={filter} setFilter={setFilter} />
        <FilterSection title="Document"        k="scope"     options={docOpts}       filter={filter} setFilter={setFilter} />
        <FilterSection title="Origin"          k="origin"    options={originOpts}    filter={filter} setFilter={setFilter} />
        {adhocCount > 0 && (
          <button
            onClick={showAdhocOnly}
            className="mx-3 mt-2 mb-3 w-[calc(100%-1.5rem)] px-2 py-1.5 rounded text-[10px] bg-status-gold/10 text-status-gold hover:bg-status-gold/20 flex items-center gap-1.5 font-mono"
            title="Show only ad-hoc rules discovered from this LC"
          >
            <span>★</span>
            <span>{adhocCount} rules discovered from this LC</span>
          </button>
        )}
      </div>
    </aside>
  );
}
