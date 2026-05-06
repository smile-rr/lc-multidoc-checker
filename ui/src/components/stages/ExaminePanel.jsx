import React, { useEffect, useMemo, useState } from 'react';
import { RerunButton } from '../shared/RerunButton';
import { StageProgressMeter } from '../shared/StageProgressMeter';
import { useStageProgress } from '../../hooks/useStageProgress';
import { useDevMode } from '../../context/DevModeContext';
import { useRules } from '../../hooks/useRules';
import { useSavedViews } from '../../hooks/useSavedViews';
import { SummaryBar } from './examine/SummaryBar';
import { DiagnosticHeader } from './examine/DiagnosticHeader';
import { FilterRail } from './examine/FilterRail';
import { WorklistTable } from './examine/WorklistTable';
import { RuleDrawer } from './examine/RuleDrawer';
import { RuleReferenceModal } from './examine/RuleReferenceModal';
import { ResizeHandle } from './parse/ResizeHandle';
import { OFFICER_ID } from '../../lib/officer';
import { StagePage } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { EyebrowLabel } from '../ui/EyebrowLabel';
import { GhostButton } from '../ui/Button';

const DEFAULT_FILTER = {};
// "Default" mode: no grouping at all — every row in one flat list, sorted by
// rule sequence (catalog-declared order). The backend emits rules in catalog
// order; we mirror that order here so the officer's worklist matches both
// the catalog yaml and the live execution sequence.
const DEFAULT_NAV = 'default';
const DEFAULT_SORT = { col: 'seq', dir: 'asc' };

const SEV_RANK = { CRITICAL: 4, MAJOR: 3, MINOR: 2, OBSERVATION: 1 };
const STATUS_RANK = { FAIL: 0, DOUBTS: 1, PASS: 2, NOT_APPLICABLE: 3 };

/**
 * Stage 3 — Examine. Filter rail + sortable worklist + rule drawer with overrides.
 */
export function ExaminePanel({ session, stagesCompleted, events, onContinue, onBack }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const examineMeta = session?.finalReport?.examine_meta;
  const sessionStatus = session?.status;
  const { rules, consistencyWarnings, loading, refresh, override, reset } = useRules(sessionId, sessionStatus, examineMeta);
  const { views: savedViews, save, remove } = useSavedViews();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [navMode, setNavMode] = useState(DEFAULT_NAV);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState('default');
  const [referenceOpen, setReferenceOpen] = useState(false);

  // Drawer width — drag-resizable, persisted across sessions like Parse.
  const STORAGE_DRAWER_W = 'lcv2-examine-drawer-width';
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const v = parseInt(typeof window !== 'undefined' ? localStorage.getItem(STORAGE_DRAWER_W) || '' : '', 10);
    return Number.isFinite(v) && v >= 360 ? v : 540;
  });
  const setDrawerWidthByDrag = (w) => {
    setDrawerWidth(w);
    try { localStorage.setItem(STORAGE_DRAWER_W, String(w)); } catch {}
  };

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
    if (filter.checkType?.length && !filter.checkType.includes(r.checkType)) return false;
    if (filter.scope?.length && !(r.scope || []).some(s => filter.scope.includes(s))) return false;
    if (filter.topic?.length) {
      const prefix = (r.ruleId || '').split('-')[0];
      if (!filter.topic.includes(prefix)) return false;
    }
    return true;
  }), [rules, filter]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    const key = (r) => {
      switch (sort.col) {
        case 'seq':      return r.seqNum ?? 9999;
        case 'status':   return STATUS_RANK[r.effectiveVerdict || r.verdict] ?? 9;
        case 'tier':     return r.checkType || '';
        case 'article':  return r.article || '';
        case 'scope':    return (r.scope || [])[0] || '';
        case 'rule':     return r.label || r.ruleId;
        case 'severity': return SEV_RANK[r.severity] ?? 0;
        case 'duration': return r.durationMs ?? -1;
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
    // In Default mode "no grouping" means literally no grouping anywhere —
    // active + NA + out-of-scope all collapse into one flat sorted list.
    // The verdict pill on each row still tells the officer the status.
    if (navMode === 'default') {
      const all = [...active, ...na, ...oos];
      return {
        groupedActive: all.length ? { '': all } : {},
        groupedNa: {},
        groupedOutOfScope: {},
        flatActive: active,
        flatNa: na,
        flatOutOfScope: oos,
        activeCount: all.length,
      };
    }
    const groupOf = (rs) => {
      const out = {};
      for (const r of rs) {
        const key = navMode === 'doc' ? ((r.scope || [])[0] || '—')
          : navMode === 'topic' ? ((r.ruleId || '').split('-')[0] || 'Other')
          : navMode === 'field' ? (r.canonicalField || 'Other / Planned')
          : (r.evidence?.lc?.toString().split(':')[0] || 'Other');
        (out[key] = out[key] || []).push(r);
      }
      return out;
    };
    return {
      groupedActive: groupOf(active),
      groupedNa: groupOf(na),
      groupedOutOfScope: groupOf(oos),
      flatActive: active,
      flatNa: na,
      flatOutOfScope: oos,
      activeCount: active.length,
    };
  }, [sorted, navMode]);

  const [diagFilter, setDiagFilter] = useState(null);
  // Filter rail open/closed state — persisted in localStorage so the officer's
  // last preference sticks across sessions (and tab reloads). Default: open.
  const [filterCollapsed, setFilterCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage?.getItem('examineFilterCollapsed');
    return v === 'true';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem('examineFilterCollapsed', String(filterCollapsed));
  }, [filterCollapsed]);
  // Filter the worklist scope from the DiagnosticHeader pills.
  // null=all, 'ran'=PASS/FAIL/DOUBTS, 'na'=NOT_APPLICABLE, 'oos'=out-of-scope, 'pending', 'failed'.
  const effectiveBuckets = useMemo(() => {
    if (!diagFilter) return buckets;
    const empty = {};
    if (diagFilter === 'ran') {
      const ran = buckets.flatActive.filter(r => {
        const v = r.effectiveVerdict || r.verdict;
        return v === 'PASS' || v === 'FAIL' || v === 'DOUBTS';
      });
      return { ...buckets, groupedActive: groupByNav(ran), groupedNa: empty, groupedOutOfScope: empty };
    }
    if (diagFilter === 'na') {
      return { ...buckets, groupedActive: empty, groupedOutOfScope: empty };
    }
    if (diagFilter === 'oos') {
      return { ...buckets, groupedActive: empty, groupedNa: empty };
    }
    if (diagFilter === 'pending' || diagFilter === 'failed') {
      const want = diagFilter === 'pending' ? 'PENDING' : 'FAILED';
      const subset = buckets.flatActive.filter(r => (r.effectiveVerdict || r.verdict) === want);
      return { ...buckets, groupedActive: groupByNav(subset), groupedNa: empty, groupedOutOfScope: empty };
    }
    return buckets;
  }, [buckets, diagFilter, navMode]);

  function groupByNav(rs) {
    if (navMode === 'default') return rs.length ? { '': rs } : {};
    const out = {};
    for (const r of rs) {
      const key = navMode === 'doc' ? ((r.scope || [])[0] || '—')
        : navMode === 'topic' ? ((r.ruleId || '').split('-')[0] || 'Other')
        : navMode === 'field' ? (r.canonicalField || 'Other / Planned')
        : (r.evidence?.lc?.toString().split(':')[0] || 'Other');
      (out[key] = out[key] || []).push(r);
    }
    return out;
  }

  const selected = rules.find(r => r.ruleId === selectedId);

  // Flat ordered list of rule IDs as they appear in the worklist, across all
  // three buckets — used for keyboard ↑/↓ navigation when the drawer is open.
  const navIds = useMemo(() => {
    const ids = [];
    const eat = (grouped) => {
      for (const items of Object.values(grouped || {})) {
        for (const r of items) ids.push(r.ruleId);
      }
    };
    eat(effectiveBuckets.groupedActive);
    eat(effectiveBuckets.groupedNa);
    eat(effectiveBuckets.groupedOutOfScope);
    return ids;
  }, [effectiveBuckets]);

  // ↑/↓ moves the selection up/down through the visible worklist; Esc closes
  // the drawer. Suppressed while the user is typing in an input/textarea or
  // a contenteditable surface so it doesn't fight with form fields inside the
  // drawer (override note, etc.).
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.key === 'Escape') {
        setSelectedId(null);
        e.preventDefault();
        return;
      }
      const i = navIds.indexOf(selectedId);
      if (i < 0) return;
      const next = e.key === 'ArrowDown'
        ? Math.min(navIds.length - 1, i + 1)
        : Math.max(0, i - 1);
      if (navIds[next] !== selectedId) {
        setSelectedId(navIds[next]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, navIds]);

  const isDirty = JSON.stringify(filter) !== '{}' || navMode !== DEFAULT_NAV
    || JSON.stringify(sort) !== JSON.stringify(DEFAULT_SORT);
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

  // Sign-off gate — every system-flagged rule (raw verdict FAIL or DOUBTS) must
  // have an officer override recorded before Continue enables. PASS / N/A /
  // out-of-scope / FAILED (system error) do not block. DEV MODE bypasses.
  const unaddressed = useMemo(
    () => rules.filter(r =>
      !isOutOfScope(r) &&
      (r.verdict === 'FAIL' || r.verdict === 'DOUBTS') &&
      !r.override
    ),
    [rules]
  );
  const gateBlockers = unaddressed.length > 0
    ? [`${unaddressed.length} rule${unaddressed.length === 1 ? '' : 's'} need officer override (FAIL / DOUBTS)`]
    : [];
  const canContinue = devMode || (examineDone && unaddressed.length === 0);

  // Two-state toolbar meta — mirrors Parse stage's "extracting M/N" → "M/N reviewed" pattern.
  // While running: per-phase progress meter consuming SSE events.
  // While complete: a calm verdict snapshot in monospace, status-coloured.
  const examineProgress = useStageProgress(events, 'examine', sessionStatus, examineDone);
  const planned = rules.filter(r => !isOutOfScope(r));
  const completedCount = planned.filter(r => (r.verdict || r.effectiveVerdict) !== 'PENDING').length;
  const verdictTally = useMemo(() => {
    const t = { fail: 0, doubts: 0, pass: 0, na: 0, failed: 0 };
    for (const r of planned) {
      const v = r.effectiveVerdict || r.verdict;
      if (v === 'FAIL') t.fail++;
      else if (v === 'DOUBTS') t.doubts++;
      else if (v === 'PASS') t.pass++;
      else if (v === 'NOT_APPLICABLE') t.na++;
      else if (v === 'FAILED') t.failed++;
    }
    return t;
  }, [planned]);

  const isRunning = examineProgress.phase === 'running';
  // While running, show only a minimal "current rule" pill in the toolbar — the
  // DiagnosticHeader below carries the authoritative bucket counts (ran / N/A /
  // out-of-scope / pending), so we don't duplicate progress in two places.
  const meta = isRunning ? (
    <span className="text-[11px] flex items-center gap-1.5 font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-status-blue animate-pulse" />
      <span className="text-status-blue">running</span>
      {examineProgress.label && (
        <span className="text-muted">· {examineProgress.label}</span>
      )}
      {examineProgress.sub && (
        <span className="text-muted/70">({examineProgress.sub})</span>
      )}
    </span>
  ) : (
    <span className="text-[11px] flex items-center gap-2 font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${verdictTally.fail > 0 ? 'bg-status-red' : verdictTally.doubts > 0 ? 'bg-status-gold' : 'bg-status-green'}`} />
      <span className="text-muted">{planned.length} rules</span>
      {verdictTally.fail > 0 && <span className="text-status-red">· {verdictTally.fail} fail</span>}
      {verdictTally.doubts > 0 && <span className="text-status-gold">· {verdictTally.doubts} doubts</span>}
      {verdictTally.pass > 0 && verdictTally.fail === 0 && verdictTally.doubts === 0 && (
        <span className="text-status-green">· all clear</span>
      )}
      {verdictTally.na > 0 && <span className="text-muted">· {verdictTally.na} n/a</span>}
      {examineDone && unaddressed.length > 0 && !devMode && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-status-goldSoft text-status-gold font-semibold tracking-wider">
          ⚐ {unaddressed.length} need officer override
        </span>
      )}
      {devMode && unaddressed.length > 0 && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold tracking-wider">
          DEV · gate bypassed ({unaddressed.length} unaddressed)
        </span>
      )}
    </span>
  );

  return (
    <StagePage>
      {/* Stage hierarchy: top nav · stage row (PipelineNav) · title row · then
          full-width informational bands · then side-nav + content body. The
          title row owns the entire width — like Parse — so the FilterRail
          drops below it. */}
      <StageToolbar
        title="Examine"
        meta={meta}
        actions={
          <>
            <GhostButton
              onClick={() => setReferenceOpen(true)}
              title="Open the full v2 rule catalog with UCP 600 / ISBP 821 citations"
            >
              📖 reference
            </GhostButton>
            <RerunButton sessionId={sessionId} stage="examine" devMode={devMode} />
            <StageNavButtons
              stage="examine"
              onBack={onBack}
              onContinue={onContinue}
              canContinue={canContinue}
              blockers={gateBlockers}
            />
          </>
        }
      />

      <SummaryBar rules={rules} />

      <DiagnosticHeader
        active={buckets.flatActive}
        notApplicable={buckets.flatNa}
        outOfScope={buckets.flatOutOfScope}
        statusFilter={diagFilter}
        onStatusFilter={setDiagFilter}
      />

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
          collapsed={filterCollapsed}
          onToggleCollapsed={() => setFilterCollapsed(c => !c)}
        />

        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Worklist sub-header — count + view controls + group-by toggle.
              Lives right above the table so progress + filters stay visually
              attached to what they describe, not buried in the stage title. */}
          {rules.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-line bg-slate2/40 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <EyebrowLabel>WORKLIST</EyebrowLabel>
                <span className="text-[11px] font-mono">
                  <span className={completedCount === planned.length ? 'text-status-green' : 'text-navy-1'}>
                    {completedCount}
                  </span>
                  <span className="text-line"> / </span>
                  <span className="text-muted">{planned.length}</span>
                </span>
                {planned.length - completedCount > 0 && (
                  <span className="text-[10px] text-status-gold font-mono">
                    {planned.length - completedCount} pending
                  </span>
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
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <span className="text-muted mr-1">GROUP BY</span>
                {/* Default = no grouping, single sorted list. */}
                {[
                  ['default', 'Default',  'No grouping — flat list sorted by article'],
                  ['field',   'Field',    'Group by canonical field (currency, amount, …)'],
                  ['doc',     'Document', 'Group by document type (INV / BOL / …)'],
                  ['topic',   'Topic',    'Group by rule topic (CCY / AMT / DATE / …)'],
                ].map(([id, l, tip]) => (
                  <button
                    key={id}
                    onClick={() => setNavMode(id)}
                    title={tip}
                    className={`px-2 py-0.5 rounded transition-colors
                      ${navMode === id ? 'bg-navy-1 text-white' : 'border border-line text-muted hover:text-navy-1 hover:bg-slate2'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">Loading rules…</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No rule results yet.</div>
          ) : (
            <WorklistTable
              groupedActive={effectiveBuckets.groupedActive}
              groupedNa={effectiveBuckets.groupedNa}
              groupedOutOfScope={effectiveBuckets.groupedOutOfScope}
              navMode={navMode}
              sort={sort}
              setSort={setSort}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {selected && (
          <>
            <ResizeHandle
              width={drawerWidth}
              onResize={setDrawerWidthByDrag}
              min={420}
              max={900}
            />
            <RuleDrawer
              rule={selected}
              width={drawerWidth}
              session={session}
              onClose={() => setSelectedId(null)}
              onOverride={handleOverride}
              onResetOverride={handleResetOverride}
            />
          </>
        )}
      </div>

      <RuleReferenceModal
        open={referenceOpen}
        onClose={() => setReferenceOpen(false)}
        rules={rules}
      />
    </StagePage>
  );
}

