import React, { useEffect, useMemo, useState } from 'react';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useRules } from '../../hooks/useRules';
import { useSavedViews } from '../../hooks/useSavedViews';
import { SummaryBar } from './examine/SummaryBar';
import { FilterRail } from './examine/FilterRail';
import { WorklistTable } from './examine/WorklistTable';
import { RuleDrawer } from './examine/RuleDrawer';
import { ExaminePhaseStrip } from './examine/ExaminePhaseStrip';
import { PlanReviewPane } from './examine/PlanReviewPane';
import { OFFICER_ID } from '../../lib/officer';
import { StagePage } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { EyebrowLabel } from '../ui/EyebrowLabel';
import { GhostButton } from '../ui/Button';

const DEFAULT_FILTER = {};
const DEFAULT_NAV = 'article';
const DEFAULT_SORT = { col: null, dir: null };

const SEV_RANK = { CRITICAL: 4, MAJOR: 3, MINOR: 2, OBSERVATION: 1 };
const STATUS_RANK = { FAIL: 0, DOUBTS: 1, PASS: 2, NOT_APPLICABLE: 3 };

/**
 * Stage 3 — Examine. Filter rail + sortable worklist + rule drawer with overrides.
 */
export function ExaminePanel({ session, stagesCompleted, events, onContinue, onBack }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const examineMeta = session?.finalReport?.examine_meta;
  const { rules, adhocRules, consistencyWarnings, loading, refresh, override, reset } = useRules(sessionId, examineMeta, events);
  const { views: savedViews, save, remove } = useSavedViews();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [navMode, setNavMode] = useState(DEFAULT_NAV);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState('default');

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
    if (filter.origin?.length && !filter.origin.includes(r.origin || 'CATALOG')) return false;
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

  const isOutOfScope = (r) => (r.explanation || '').startsWith('[OUT_OF_SCOPE]');
  const buckets = useMemo(() => {
    const active = [], na = [], oos = [];
    for (const r of sorted) {
      if (isOutOfScope(r)) oos.push(r);
      else if ((r.effectiveVerdict || r.verdict) === 'NOT_APPLICABLE') na.push(r);
      else active.push(r);
    }
    const groupOf = (rs) => {
      const out = {};
      for (const r of rs) {
        const key = navMode === 'article' ? (r.article || '—')
          : navMode === 'doc' ? ((r.scope || [])[0] || '—')
          : navMode === 'origin' ? (r.origin || 'CATALOG')
          : (r.evidence?.lc?.toString().split(':')[0] || 'Other');
        (out[key] = out[key] || []).push(r);
      }
      return out;
    };
    return {
      groupedActive: groupOf(active),
      groupedNa: groupOf(na),
      groupedOutOfScope: groupOf(oos),
      activeCount: active.length,
    };
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

  // Walk events to find latest ExaminePhase to drive the toolbar's review-phase counter.
  const currentPhase = useMemo(() => {
    if (!events || examineDone) return examineDone ? 'review' : null;
    let p = null;
    for (const e of events) {
      if (e?.type === 'StageStarted' && e.data?.stageName === 'examine') p = null;
      if (e?.type === 'ExaminePhase') p = e.data?.phase || p;
    }
    return p;
  }, [events, examineDone]);
  const showReviewCount = currentPhase === 'review' || examineDone;
  const showPhaseStrip = (session?.status || '').toUpperCase() === 'EXAMINE' || examineDone;
  const planAdhocCount = (adhocRules || []).length;
  const showPlanPane = (currentPhase === 'plan' || (currentPhase && currentPhase !== 'derive' && planAdhocCount > 0));
  const collapsePlan = examineDone || currentPhase === 'review';

  const deriveSummary = useMemo(() => {
    const fr = session?.finalReport;
    const lcSection = fr?.lc;
    const derived = lcSection?.derived;
    if (!derived) return null;
    const inco = derived.incoterms_class || derived.incotermsClass;
    const tol = derived.effective_tolerance?.pct ?? derived.effectiveTolerance?.pct;
    const tenor = derived.tenor_class || derived.tenorClass;
    return [inco, tol != null ? `±${tol}%` : null, tenor].filter(Boolean).join(' · ') || null;
  }, [session]);

  return (
    <StagePage>
      <SummaryBar rules={rules} docCount={docCount} adhocRules={adhocRules} consistencyWarnings={consistencyWarnings} />

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
          <StageToolbar
            title={null}
            meta={
              <>
                {showReviewCount && (
                  <EyebrowLabel>WORKLIST · {sorted.length} of {rules.length}</EyebrowLabel>
                )}
                {activeView && savedViews.find(v => v.id === activeView) && activeView !== 'default' && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-teal-1/10 text-teal-1 flex items-center gap-1 font-mono">
                    ★ {savedViews.find(v => v.id === activeView).name}
                  </span>
                )}
                {isDirty && (
                  <GhostButton onClick={resetView} title="Clear filters, group-by, sort, and selection">
                    ↻ reset
                  </GhostButton>
                )}
              </>
            }
            actions={
              <>
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span className="text-muted mr-1">GROUP BY</span>
                  {[['article','Article'], ['doc','Document'], ['field','Field'], ['origin','Origin']].map(([id, l]) => (
                    <button
                      key={id}
                      onClick={() => setNavMode(id)}
                      className={`px-2 py-0.5 rounded
                        ${navMode === id ? 'bg-navy-1 text-white' : 'border border-line hover:bg-slate2'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <RerunButton sessionId={sessionId} stage="examine" devMode={devMode} />
                <StageNavButtons
                  stage="examine"
                  onBack={onBack}
                  onContinue={onContinue}
                  canContinue={canContinue}
                />
              </>
            }
            className="bg-slate2"
          />

          {showPhaseStrip && (
            <ExaminePhaseStrip
              events={events}
              session={session}
              examineDone={examineDone}
              deriveSummary={deriveSummary}
            />
          )}
          {showPlanPane && (
            <PlanReviewPane adhocRules={adhocRules} collapsedByDefault={collapsePlan} />
          )}

          {loading && rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">Loading rules…</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No rule results yet.</div>
          ) : (
            <WorklistTable
              groupedActive={buckets.groupedActive}
              groupedNa={buckets.groupedNa}
              groupedOutOfScope={buckets.groupedOutOfScope}
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
            adhocRules={adhocRules}
            consistencyWarnings={consistencyWarnings}
            onClose={() => setSelectedId(null)}
            onOverride={handleOverride}
            onResetOverride={handleResetOverride}
          />
        )}
      </div>
    </StagePage>
  );
}

