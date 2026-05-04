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
  // The `tier` axis describes which engine evaluated the rule. The backend
  // exposes both `checkType` (canonical) and `source` (compact display label);
  // we filter on `checkType` so the four tiers map cleanly.
  const tierOpts = [
    ['PROGRAMMATIC', 'Programmatic'],
    ['AGENT',        'Agent'],
    ['AGENT_TOOL',   'Agent + tool'],
    ['AGENTIC',      'Agentic'],
  ].map(([id, label]) => ({
    id, label,
    count: rules.filter(r => r.checkType === id).length,
  }));
  const docOpts = docs.map(d => {
    const t = docTypeMeta(d);
    return {
      id: d, label: t.short,
      count: rules.filter(r => (r.scope || []).includes(d)).length,
    };
  });
  // Topic filter — derived from rule_id prefix (CCY / AMT / DATE / PARTY /
  // GOODS / SHIP / DOC / COND). Mirrors how the catalog is grouped.
  const TOPIC_LABELS = {
    CCY:   'Currency',
    AMT:   'Amount',
    DATE:  'Dates',
    PARTY: 'Parties',
    GOODS: 'Goods',
    SHIP:  'Shipment',
    DOC:   'Documents',
    COND:  'Conditions',
  };
  const presentTopics = [...new Set(rules.map(r => (r.ruleId || '').split('-')[0]).filter(Boolean))];
  const topicOpts = presentTopics
    .filter(t => TOPIC_LABELS[t])
    .sort()
    .map(t => ({
      id: t,
      label: `${t} · ${TOPIC_LABELS[t]}`,
      count: rules.filter(r => (r.ruleId || '').startsWith(t + '-')).length,
    }));

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
        <FilterSection title="Tier"            k="checkType" options={tierOpts}      filter={filter} setFilter={setFilter} />
        <FilterSection title="Document"        k="scope"     options={docOpts}       filter={filter} setFilter={setFilter} />
        {topicOpts.length > 0 && (
          <FilterSection title="Topic"         k="topic"     options={topicOpts}     filter={filter} setFilter={setFilter} />
        )}
      </div>
    </aside>
  );
}
