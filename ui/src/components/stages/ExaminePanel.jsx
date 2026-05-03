import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../shared/Spinner';
import { ActivityStrip } from '../shared/ActivityStrip';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useRules } from '../../hooks/useRules';
import { useSavedViews } from '../../hooks/useSavedViews';
import { SummaryBar } from './examine/SummaryBar';
import { FilterRail } from './examine/FilterRail';
import { WorklistTable } from './examine/WorklistTable';
import { RuleDrawer } from './examine/RuleDrawer';

const OFFICER_ID = 'A. Wijaya';

const DEFAULT_FILTER = {};
const DEFAULT_NAV = 'article';
const DEFAULT_SORT = { col: null, dir: null };

const SEV_RANK = { CRITICAL: 4, MAJOR: 3, MINOR: 2, OBSERVATION: 1 };
const STATUS_RANK = { FAIL: 0, DOUBTS: 1, PASS: 2, NOT_APPLICABLE: 3 };

/**
 * Stage 3 — Examine. Filter rail + sortable worklist + rule drawer with overrides.
 * Data lives server-side (GET /sessions/{id}/rules); officer actions persist
 * via override / reset endpoints.
 */
export function ExaminePanel({ session, stagesCompleted, events, ruleProgress, onContinue, onBack }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const { rules, loading, refresh, override, reset } = useRules(sessionId);
  const { views: savedViews, save, remove } = useSavedViews();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [navMode, setNavMode] = useState(DEFAULT_NAV);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState('default');

  // Track the current view based on filter/nav/sort matches
  useEffect(() => {
    const m = savedViews.find(v =>
      JSON.stringify(v.filter || {}) === JSON.stringify(filter) &&
      v.navMode === navMode &&
      JSON.stringify(v.sort || DEFAULT_SORT) === JSON.stringify(sort)
    );
    setActiveView(m ? m.id : null);
  }, [filter, navMode, sort, savedViews]);

  const docCount = (session?.documents ?? []).filter(d => d.doc_type !== 'UNKNOWN').length;

  const filtered = useMemo(() => rules.filter(r => {
    const v = r.effectiveVerdict || r.verdict;
    if (filter.status?.length && !filter.status.includes(v)) return false;
    if (filter.severity?.length && !filter.severity.includes(r.severity)) return false;
    if (filter.attention?.length && !(r.attention || []).some(t => filter.attention.includes(t))) return false;
    if (filter.source?.length && !filter.source.includes(r.source)) return false;
    if (filter.scope?.length && !(r.scope || []).some(s => filter.scope.includes(s))) return false;
    return true;
  }), [rules, filter]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    const key = (r) => {
      switch (sort.col) {
        case 'status':   return STATUS_RANK[r.effectiveVerdict || r.verdict] ?? 9;
        case 'article':  return r.article || '';
        case 'scope':    return (r.scope || [])[0] || '';
        case 'rule':     return r.label || r.ruleId;
        case 'severity': return SEV_RANK[r.severity] ?? 0;
        case 'source':   return r.source || '';
        case 'agree':    return r.agree || '';
        case 'reliab':   return r.reliab ?? -1;
        default: return 0;
      }
    };
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = key(a), bv = key(b);
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    const out = {};
    for (const r of sorted) {
      const key = navMode === 'article' ? (r.article || '—')
        : navMode === 'doc' ? ((r.scope || [])[0] || '—')
        : (r.evidence?.lc?.toString().split(':')[0] || 'Other');
      (out[key] = out[key] || []).push(r);
    }
    return out;
  }, [sorted, navMode]);

  const selected = rules.find(r => r.ruleId === selectedId);

  const isDirty = JSON.stringify(filter) !== '{}' || navMode !== DEFAULT_NAV || sort.col !== null;
  const hasStateForSave = isDirty
    && !savedViews.find(v =>
      JSON.stringify(v.filter || {}) === JSON.stringify(filter) &&
      v.navMode === navMode &&
      JSON.stringify(v.sort || DEFAULT_SORT) === JSON.stringify(sort));

  const applyView = (v) => {
    setFilter(v.filter || {});
    setNavMode(v.navMode || DEFAULT_NAV);
    setSort(v.sort || DEFAULT_SORT);
  };
  const saveCurrent = () => {
    const name = window.prompt('Name this view:', '');
    if (!name) return;
    const v = save(name, { filter: { ...filter }, navMode, sort: { ...sort } });
    setActiveView(v.id);
  };

  const resetView = () => {
    setFilter(DEFAULT_FILTER);
    setNavMode(DEFAULT_NAV);
    setSort(DEFAULT_SORT);
    setSelectedId(null);
  };

  const handleOverride = async (ruleId, body) => {
    await override(ruleId, { ...body, officerId: OFFICER_ID });
  };
  const handleResetOverride = async (ruleId) => {
    await reset(ruleId, OFFICER_ID);
  };

  const examineDone = stagesCompleted?.has('examine');
  const canContinue = devMode || examineDone;

  return (
    <div className="flex flex-col h-full">
      <SummaryBar rules={rules} docCount={docCount} />

      <div className="flex flex-1 overflow-hidden">
        <FilterRail
          rules={rules}
          filter={filter}
          setFilter={setFilter}
          savedViews={savedViews}
          applyView={applyView}
          saveCurrent={saveCurrent}
          deleteView={remove}
          activeView={activeView}
          hasStateForSave={hasStateForSave}
        />

        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-3 bg-slate2 flex-wrap">
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">
              WORKLIST · {sorted.length} of {rules.length}
            </div>
            {!examineDone && <Spinner size="sm" label={`checking…`} />}
            {activeView && savedViews.find(v => v.id === activeView) && activeView !== 'default' && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-teal-1/10 text-teal-1 flex items-center gap-1 font-mono">
                ★ {savedViews.find(v => v.id === activeView).name}
              </span>
            )}
            {isDirty && (
              <button
                onClick={resetView}
                title="Clear filters, group-by, sort, and selection"
                className="text-[10px] px-2 py-0.5 rounded bg-navy-1 text-white hover:bg-navy-2 flex items-center gap-1 font-mono"
              >
                ↻ RESET VIEW
              </button>
            )}
            <div className="ml-auto flex items-center gap-1 text-[10px] font-mono">
              <span className="text-muted mr-1">GROUP BY</span>
              {[['article','Article'], ['doc','Document'], ['field','Field']].map(([id, l]) => (
                <button
                  key={id}
                  onClick={() => setNavMode(id)}
                  className={`px-2 py-0.5 rounded
                    ${navMode === id ? 'bg-navy-1 text-white' : 'border border-line hover:bg-white'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {onBack && (
              <button onClick={onBack} className="px-3 py-1.5 rounded-[8px] border border-line text-[11px] hover:bg-white">
                ← Reconcile
              </button>
            )}
            <RerunButton sessionId={sessionId} stage="examine" devMode={devMode} />
            <button
              onClick={onContinue}
              disabled={!canContinue}
              className={`px-3 py-1.5 rounded-[8px] text-[11px]
                ${canContinue ? 'bg-navy-1 text-white hover:bg-navy-2' : 'bg-line text-muted cursor-not-allowed'}`}
            >
              Continue to Sign-off →
            </button>
          </div>

          <div className="px-4 pb-2 bg-slate2 border-b border-line">
            <ActivityStrip
              events={events}
              filter={(m) => m.type === 'RuleStarted' || m.type === 'RuleChecked'}
              active={!examineDone}
              prefix={ruleProgress ? `${ruleProgress.index}/${ruleProgress.total}` : 'Rules:'}
            />
          </div>

          {loading && rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">Loading rules…</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No rule results yet.</div>
          ) : (
            <WorklistTable
              grouped={grouped}
              navMode={navMode}
              sort={sort}
              setSort={setSort}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {selected && (
          <RuleDrawer
            rule={selected}
            onClose={() => setSelectedId(null)}
            onOverride={handleOverride}
            onResetOverride={handleResetOverride}
          />
        )}
      </div>
    </div>
  );
}
