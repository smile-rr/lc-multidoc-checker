import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../shared/Spinner';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useReconcile } from '../../hooks/useReconcile';
import { GROUP_ORDER, groupOf } from '../../constants/reconcileGroups';
import { ReconcileFilterBar } from './reconcile/ReconcileFilterBar';
import { LockSummaryPanel } from './reconcile/LockSummaryPanel';
import { UnlockModal } from './reconcile/UnlockModal';
import { PivotTable } from './reconcile/PivotTable';

const OFFICER_ID = 'A. Wijaya';

/**
 * Stage 2 — Reconcile.
 * Pivot table of canonical fields × documents with filter/search/triage/lock.
 * Continue gate: locked === true (or DEV MODE).
 */
export function ReconcilePanel({ session, stagesCompleted, onContinue, onBackToParse }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;
  const nav = useNavigate();

  const { data, loading, refresh, triage, lock, unlock } = useReconcile(sessionId);

  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [unlockOpen, setUnlockOpen] = useState(false);

  const docs = session?.documents ?? [];
  // We pivot on actual confirmed doc types present in the session (excluding LC).
  const docTypes = useMemo(() => {
    const seen = new Set();
    for (const d of docs) {
      if (d.doc_type && d.doc_type !== 'UNKNOWN') seen.add(d.doc_type);
    }
    return [...seen];
  }, [docs]);
  const docMap = useMemo(() => {
    const m = {};
    for (const d of docs) m[d.doc_type] = d;
    return m;
  }, [docs]);

  // Coerce the API-provided rows into a guaranteed shape with group + label.
  const rows = useMemo(() => {
    const fields = data?.fields ?? [];
    return fields.map(f => ({
      ...f,
      group: f.group || groupOf(f.fieldKey),
      label: f.label || f.fieldKey,
    }));
  }, [data]);

  const counts = useMemo(() => rows.reduce((a, f) => {
    a[f.verdict] = (a[f.verdict] || 0) + 1;
    return a;
  }, {}), [rows]);

  const passFilter = (f) => {
    if (filter !== 'ALL' && f.verdict !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.label.toLowerCase().includes(q) && !f.fieldKey.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const grouped = useMemo(() => {
    const out = {};
    for (const f of rows) {
      const g = f.group;
      (out[g] = out[g] || []).push(f);
    }
    return out;
  }, [rows]);

  const visibleByGroup = GROUP_ORDER
    .map(g => [g, (grouped[g] || []).filter(passFilter)])
    .filter(([, items]) => items.length > 0);

  const triageMap = data?.triage ?? {};
  const locked = !!data?.locked;

  const needTriage = rows.filter(f =>
    (f.verdict === 'DISCREPANCY' || f.verdict === 'TOLERANCE') && !triageMap[f.fieldKey]
  ).length;
  const genuineCount = Object.values(triageMap).filter(t => t === 'genuine').length;
  const parseErrorCount = Object.values(triageMap).filter(t => t === 'parse-error').length;

  const canContinue = devMode || locked;

  const handleTriage = async (fieldKey, decision) => {
    // Reset is null → upsert empty? Server has no DELETE for triage; we pass empty-string sentinel.
    await triage(fieldKey, decision ?? '', OFFICER_ID);
    await refresh();
  };
  const handleLock = async () => {
    await lock(OFFICER_ID);
    await refresh();
  };
  const handleUnlock = async (reason) => {
    await unlock(OFFICER_ID, reason);
    await refresh();
    setUnlockOpen(false);
  };

  const reconcileDone = stagesCompleted?.has('reconcile');

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="px-6 py-3 bg-white border-b border-line flex items-center gap-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">STAGE 2</div>
          <div className="text-[15px] font-semibold tracking-tight">Reconcile · cross-document field alignment</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!reconcileDone && <Spinner size="sm" label="pivoting…" />}
          {locked && <span className="text-[10px] px-2 py-0.5 rounded bg-teal-1 text-white font-mono">🔒 LOCKED</span>}
          {onBackToParse && (
            <button onClick={onBackToParse} className="px-3 py-1.5 rounded-[8px] border border-line text-xs hover:bg-slate2">
              ← Back to Parse
            </button>
          )}
          <RerunButton sessionId={sessionId} stage="reconcile" devMode={devMode} disabled={locked && !devMode} />
          {!locked
            ? (
              <button
                onClick={handleLock}
                disabled={!devMode && needTriage > 0}
                title={needTriage > 0 ? `${needTriage} discrepanc${needTriage === 1 ? 'y' : 'ies'} still need triage` : 'Lock dataset'}
                className="px-4 py-1.5 rounded-[8px] text-xs bg-navy-1 text-white hover:bg-navy-2 disabled:bg-line disabled:text-muted disabled:cursor-not-allowed"
              >
                🔒 Lock dataset{needTriage > 0 && !devMode ? ` · ${needTriage} to triage` : ''}
              </button>
            ) : (
              <button
                onClick={onContinue}
                disabled={!canContinue}
                className={`px-4 py-1.5 rounded-[8px] text-xs ${canContinue ? 'bg-teal-1 text-white hover:bg-teal-2' : 'bg-line text-muted cursor-not-allowed'}`}
              >
                Continue to Examine →
              </button>
            )
          }
          {devMode && !locked && needTriage > 0 && (
            <button
              onClick={handleLock}
              className="text-[11px] px-3 py-1.5 rounded-[6px] bg-status-gold text-white hover:bg-status-gold/80"
              title="DEV: lock without triaging"
            >
              ⚡ Skip lock gate
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 bg-slate2">
        <div className="max-w-[1400px] mx-auto">
          <ReconcileFilterBar
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            search={search}
            setSearch={setSearch}
            onExpandAll={() => setCollapsed({})}
            onCollapseAll={() => setCollapsed(Object.fromEntries(GROUP_ORDER.map(g => [g, true])))}
            onReset={() => { setFilter('ALL'); setSearch(''); setCollapsed({}); }}
            totalFields={rows.length}
            totalDocs={docTypes.length}
          />

          {loading && rows.length === 0 ? (
            <div className="bg-white border border-line rounded-[10px] p-8 text-center text-muted text-sm">
              Loading reconcile pivot…
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white border border-line rounded-[10px] p-8 text-center text-muted text-sm">
              No reconcile rows produced yet (the pipeline may not have populated them — check final_report).
            </div>
          ) : (
            <PivotTable
              visibleByGroup={visibleByGroup}
              docTypes={docTypes}
              docMap={docMap}
              locked={locked}
              triage={triageMap}
              onTriage={handleTriage}
              onJumpToParse={(fieldKey) => nav(`/session/${sessionId}?focusField=${fieldKey}`)}
              collapsed={collapsed}
              onToggleGroup={(g) => setCollapsed(c => ({ ...c, [g]: !c[g] }))}
            />
          )}

          <LockSummaryPanel
            locked={locked}
            lockedAt={data?.lockedAt}
            lockedBy={data?.lockedBy}
            needTriage={needTriage}
            genuineCount={genuineCount}
            parseErrorCount={parseErrorCount}
            onUnlockClick={locked ? () => setUnlockOpen(true) : null}
          />
        </div>
      </div>

      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlock={handleUnlock} />
    </div>
  );
}
