import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../shared/Spinner';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useReconcile } from '../../hooks/useReconcile';
import { GROUP_ORDER, groupOf } from '../../constants/reconcileGroups';
import { compareDocType } from '../../constants/docTypes';
import { ReconcileFilterBar } from './reconcile/ReconcileFilterBar';
import { LockSummaryPanel } from './reconcile/LockSummaryPanel';
import { UnlockModal } from './reconcile/UnlockModal';
import { PivotTable } from './reconcile/PivotTable';
import { OFFICER_ID } from '../../lib/officer';
import { StagePage, StageBody } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { PageContainer } from '../ui/PageContainer';
import { Card } from '../ui/Card';
import { PrimaryButton, SecondaryButton } from '../ui/Button';

/**
 * Stage 2 — Reconcile.
 * Pivot table of canonical fields × documents with filter/search/triage/lock.
 * Single-slot CTA on the right: swaps Lock → Continue based on `locked` state.
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
  const docTypes = useMemo(() => {
    const seen = new Set();
    for (const d of docs) {
      if (d.doc_type && d.doc_type !== 'UNKNOWN') seen.add(d.doc_type);
    }
    // Sort by review priority — pivot columns now match Parse / Intake order.
    return [...seen].sort(compareDocType);
  }, [docs]);
  const docMap = useMemo(() => {
    const m = {};
    for (const d of docs) m[d.doc_type] = d;
    return m;
  }, [docs]);

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

  // Single CTA slot — swaps label based on lock state.
  const ctaSlot = locked ? (
    <StageNavButtons
      stage="reconcile"
      onBack={onBackToParse}
      onContinue={onContinue}
      canContinue={canContinue}
      continueTone="teal"
    />
  ) : (
    <>
      {onBackToParse && <SecondaryButton onClick={onBackToParse}>← Parse</SecondaryButton>}
      <PrimaryButton
        onClick={handleLock}
        disabled={!devMode && needTriage > 0}
        title={needTriage > 0 ? `${needTriage} discrepanc${needTriage === 1 ? 'y' : 'ies'} still need triage` : 'Lock dataset'}
      >
        🔒 Lock dataset{needTriage > 0 && !devMode ? ` · ${needTriage} to triage` : ''}
      </PrimaryButton>
    </>
  );

  return (
    <StagePage>
      <StageToolbar
        title="Reconcile"
        meta={
          <span className="flex items-center gap-2 text-[11px] font-mono text-muted">
            cross-document field alignment
            {!reconcileDone && <Spinner size="sm" />}
            {locked && <span className="px-2 py-0.5 rounded bg-teal-1 text-white">🔒 LOCKED</span>}
          </span>
        }
        actions={
          <>
            <RerunButton sessionId={sessionId} stage="reconcile" devMode={devMode} disabled={locked && !devMode} />
            {ctaSlot}
          </>
        }
      />

      <StageBody tone="slate" className="px-6 py-5">
        <PageContainer>
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
            <Card className="p-8 text-center text-muted text-sm">Loading reconcile pivot…</Card>
          ) : rows.length === 0 ? (
            <Card className="p-8 text-center text-muted text-sm">
              No reconcile rows produced yet (the pipeline may not have populated them — check final_report).
            </Card>
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
        </PageContainer>
      </StageBody>

      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlock={handleUnlock} />
    </StagePage>
  );
}
