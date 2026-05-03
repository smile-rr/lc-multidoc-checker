import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { StageProgressMeter } from '../shared/StageProgressMeter';
import { useStageProgress } from '../../hooks/useStageProgress';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useReconcile } from '../../hooks/useReconcile';
import { useDocActions } from '../../hooks/useDocActions';
import { compareDocType } from '../../constants/docTypes';
import { LockSummaryPanel } from './reconcile/LockSummaryPanel';
import { UnlockModal } from './reconcile/UnlockModal';
import { ReconcileMatrix } from './reconcile/ReconcileMatrix';
import { CellDecisionDrawer } from './reconcile/CellDecisionDrawer';
import { BulkDecisionMenu } from './reconcile/BulkDecisionMenu';
import { docTypeMeta } from '../../constants/docTypes';
import { CorrectionModal } from './parse/CorrectionModal';
import { OFFICER_ID } from '../../lib/officer';
import { StagePage, StageBody } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { PageContainer } from '../ui/PageContainer';
import { PrimaryButton, SecondaryButton, GhostButton } from '../ui/Button';
import { EyebrowLabel } from '../ui/EyebrowLabel';

/**
 * Stage 2 — Reconcile.
 *
 * Matrix UI: rows = canonical fields × columns = LC + each present doc.
 * LC column is sticky-left (read-only reference). Other cells with non-MATCH
 * verdicts are clickable → CellDecisionDrawer for officer triage.
 *
 * Lock gate: enabled when every non-MATCH cell has a decision (or DEV MODE).
 */
export function ReconcilePanel({ session, stagesCompleted, events, onContinue, onBackToParse }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const { data, loading, refresh, lock, unlock, decideCell, clearCell } = useReconcile(sessionId);
  const { correct } = useDocActions(sessionId);

  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [drawerCell, setDrawerCell] = useState(null);     // {row, docType}
  const [correcting, setCorrecting] = useState(null);     // {row, docType, fieldKey, value}
  const [bulkScope, setBulkScope] = useState(null);       // {kind, target, count, label, cells}
  const [focusedCell, setFocusedCell] = useState(null);   // {fieldKey, docType}

  // Doc-types present (sort by review priority; LC excluded — it's the reference)
  const docs = session?.documents ?? [];
  const docTypes = useMemo(() => {
    const seen = new Set();
    for (const d of docs) {
      if (d.doc_type && d.doc_type !== 'UNKNOWN' && d.doc_type !== 'LC') seen.add(d.doc_type);
    }
    return [...seen].sort(compareDocType);
  }, [docs]);

  const docIdByType = useMemo(() => {
    const m = {};
    for (const d of docs) m[d.doc_type] = d.id;
    return m;
  }, [docs]);

  const rows = data?.fields ?? [];
  const cellDecisions = data?.cellDecisions ?? [];

  // (fieldKey, docType) → decision lookup
  const decisionsByCell = useMemo(() => {
    const m = new Map();
    for (const d of cellDecisions) m.set(`${d.fieldKey}|${d.docType}`, d);
    return m;
  }, [cellDecisions]);

  // Lock gate: every non-MATCH non-NA non-LC cell must be decided OR edited
  const undecidedCount = useMemo(() => {
    let n = 0;
    for (const row of rows) {
      for (const dt of docTypes) {
        const cell = row.cells?.[dt];
        if (!cell) continue;
        const v = cell.verdict;
        if (v === 'MATCH' || v === 'NA') continue;
        if (!decisionsByCell.has(`${row.fieldKey}|${dt}`)) n++;
      }
    }
    return n;
  }, [rows, docTypes, decisionsByCell]);

  const counts = useMemo(() => {
    const c = { MATCH: 0, TOLERANCE: 0, DISCREPANCY: 0, MISSING: 0, NA: 0 };
    for (const row of rows) {
      for (const dt of docTypes) {
        const v = row.cells?.[dt]?.verdict;
        if (v && c[v] != null) c[v]++;
      }
    }
    return c;
  }, [rows, docTypes]);

  const locked = !!data?.locked;
  const reconcileRunning = session?.status === 'RECONCILE';
  const reconcileProgress = useStageProgress(events, 'reconcile', session?.status, stagesCompleted?.has('reconcile'));
  const canContinue = devMode || locked;

  const handleLock = async () => { await lock(OFFICER_ID); };
  const handleUnlock = async (reason) => {
    await unlock(OFFICER_ID, reason);
    setUnlockOpen(false);
  };

  const handleCellClick = (row, docType) => {
    if (locked) return;
    setDrawerCell({ row, docType });
  };

  const handleDecide = async ({ decision, note }) => {
    if (!drawerCell) return;
    await decideCell({
      fieldKey: drawerCell.row.fieldKey,
      docType: drawerCell.docType,
      decision, note,
      officerId: OFFICER_ID,
    });
  };

  const handleClearCellDecision = async () => {
    if (!drawerCell) return;
    await clearCell({
      fieldKey: drawerCell.row.fieldKey,
      docType: drawerCell.docType,
      officerId: OFFICER_ID,
    });
  };

  const handleEditCell = () => {
    if (!drawerCell) return;
    const { row, docType } = drawerCell;
    setCorrecting({
      docId: docIdByType[docType],
      fieldKey: row.fieldKey,
      value: row.cells?.[docType]?.value,
      docType,
    });
    setDrawerCell(null);
  };

  // ── Bulk row / column ────────────────────────────────────────────────
  const collectAttentionCells = (predicate) => {
    const out = [];
    for (const row of rows) {
      for (const dt of docTypes) {
        if (!predicate(row, dt)) continue;
        const v = row.cells?.[dt]?.verdict;
        if (v === 'DISCREPANCY' || v === 'TOLERANCE' || v === 'MISSING') {
          out.push({ fieldKey: row.fieldKey, docType: dt });
        }
      }
    }
    return out;
  };

  const handleRowBulk = (row) => {
    const cells = collectAttentionCells((r) => r.fieldKey === row.fieldKey);
    if (cells.length === 0) return;
    setBulkScope({ kind: 'row', target: row.fieldKey, label: row.label || row.fieldKey, count: cells.length, cells });
  };

  const handleColumnBulk = (docType) => {
    const cells = collectAttentionCells((_r, dt) => dt === docType);
    if (cells.length === 0) return;
    const meta = docTypeMeta(docType);
    setBulkScope({ kind: 'column', target: docType, label: meta.name, count: cells.length, cells });
  };

  const applyBulk = async ({ decision, note }) => {
    if (!bulkScope) return;
    for (const c of bulkScope.cells) {
      await decideCell({
        fieldKey: c.fieldKey,
        docType: c.docType,
        decision, note,
        officerId: OFFICER_ID,
      });
    }
  };

  // ── Keyboard nav ─────────────────────────────────────────────────────
  // ↑↓ rows, ←→ cells, Enter opens drawer for the focused cell.
  // Skips MATCH/NA cells (they're not actionable). Drawer hotkeys (1/2/3/E)
  // are owned by CellDecisionDrawer itself.
  const handleKey = useCallback((e) => {
    if (drawerCell || bulkScope || correcting) return;        // drawer/menu owns keys
    if (locked) return;
    if (rows.length === 0 || docTypes.length === 0) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;        // don't hijack form fields

    const fk = focusedCell?.fieldKey;
    const dt = focusedCell?.docType;
    let rIdx = rows.findIndex(r => r.fieldKey === fk);
    let cIdx = docTypes.findIndex(d => d === dt);
    if (rIdx < 0) rIdx = 0;
    if (cIdx < 0) cIdx = 0;

    let next = null;
    if (e.key === 'ArrowDown')  next = { r: Math.min(rows.length - 1, rIdx + 1), c: cIdx };
    else if (e.key === 'ArrowUp')    next = { r: Math.max(0, rIdx - 1), c: cIdx };
    else if (e.key === 'ArrowRight') next = { r: rIdx, c: Math.min(docTypes.length - 1, cIdx + 1) };
    else if (e.key === 'ArrowLeft')  next = { r: rIdx, c: Math.max(0, cIdx - 1) };
    else if (e.key === 'Enter') {
      const row = rows[rIdx];
      if (row) {
        const v = row.cells?.[docTypes[cIdx]]?.verdict;
        if (v && v !== 'MATCH' && v !== 'NA') {
          e.preventDefault();
          handleCellClick(row, docTypes[cIdx]);
        }
      }
      return;
    } else { return; }

    if (next) {
      e.preventDefault();
      const r = rows[next.r];
      const d = docTypes[next.c];
      if (r && d) setFocusedCell({ fieldKey: r.fieldKey, docType: d });
    }
  }, [rows, docTypes, focusedCell, drawerCell, bulkScope, correcting, locked]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const handleSaveCorrection = async ({ value, issueKind, note }) => {
    if (!correcting) return;
    await correct(correcting.docId, correcting.fieldKey, {
      value, issueKind, note, officerId: OFFICER_ID,
    });
    // Auto-record an 'edited' decision for this cell so the lock gate counts it.
    await decideCell({
      fieldKey: correcting.fieldKey,
      docType: correcting.docType,
      decision: 'edited',
      note: note || 'value corrected',
      officerId: OFFICER_ID,
    });
    setCorrecting(null);
    await refresh();
  };

  const drawerDecision = drawerCell
    ? decisionsByCell.get(`${drawerCell.row.fieldKey}|${drawerCell.docType}`)
    : null;
  const drawerCellData = drawerCell ? drawerCell.row.cells?.[drawerCell.docType] : null;

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
        disabled={!devMode && undecidedCount > 0}
        title={undecidedCount > 0
          ? `${undecidedCount} cell${undecidedCount === 1 ? '' : 's'} still need a decision`
          : 'Lock dataset'}
      >
        🔒 Lock dataset{undecidedCount > 0 && !devMode ? ` · ${undecidedCount} to decide` : ''}
      </PrimaryButton>
    </>
  );

  return (
    <StagePage>
      <StageToolbar
        title="Reconcile"
        meta={
          <span className="flex items-center gap-3 text-[11px] font-mono text-muted">
            <span>cross-doc field matrix</span>
            {reconcileRunning && (
              <StageProgressMeter
                phase="running"
                label={reconcileProgress.label || 'Reconcile'}
                sub={reconcileProgress.sub || 'normalising…'}
                secsSinceLast={reconcileProgress.secsSinceLast}
                isStale={reconcileProgress.isStale}
              />
            )}
            {locked && <span className="px-2 py-0.5 rounded bg-teal-1 text-white">🔒 LOCKED</span>}
            {/* Inline counts */}
            <span className="flex items-center gap-2">
              {counts.DISCREPANCY > 0 && (
                <span className="text-status-red"><b>{counts.DISCREPANCY}</b> discrepant</span>
              )}
              {counts.TOLERANCE > 0 && (
                <span className="text-status-gold"><b>{counts.TOLERANCE}</b> tolerance</span>
              )}
              {counts.MISSING > 0 && (
                <span className="text-status-red"><b>{counts.MISSING}</b> missing</span>
              )}
              {counts.MATCH > 0 && (
                <span className="text-status-green"><b>{counts.MATCH}</b> match</span>
              )}
            </span>
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
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <EyebrowLabel>filter</EyebrowLabel>
            {['ALL', 'DISCREPANCY', 'TOLERANCE', 'MISSING', 'MATCH'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors
                  ${filter === f
                    ? 'bg-navy-1 text-white border-navy-1'
                    : 'border-line text-muted hover:text-navy-1 hover:bg-white'}`}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search field…"
              className="text-[11px] font-mono border border-line rounded px-2 py-1 ml-2 focus:outline-none focus:border-teal-1"
            />
            {(filter !== 'ALL' || search) && (
              <GhostButton onClick={() => { setFilter('ALL'); setSearch(''); }}>↻ reset</GhostButton>
            )}
            <span className="ml-auto text-[10px] text-muted font-mono">
              {undecidedCount} cell{undecidedCount === 1 ? '' : 's'} pending decision
            </span>
          </div>

          {loading && rows.length === 0 ? (
            <div className="bg-white border border-line rounded-[10px] p-8 text-center text-muted text-sm">
              Loading reconcile matrix…
            </div>
          ) : (
            <ReconcileMatrix
              rows={rows}
              docTypes={docTypes}
              decisionsByCell={decisionsByCell}
              locked={locked}
              search={search}
              filterStatus={filter}
              focusedCell={focusedCell}
              onCellClick={handleCellClick}
              onRowBulk={handleRowBulk}
              onColumnBulk={handleColumnBulk}
            />
          )}

          <LockSummaryPanel
            locked={locked}
            lockedAt={data?.lockedAt}
            lockedBy={data?.lockedBy}
            needTriage={undecidedCount}
            genuineCount={cellDecisions.filter(d => d.decision === 'genuine').length}
            parseErrorCount={cellDecisions.filter(d => d.decision === 'parse_error').length}
            onUnlockClick={locked ? () => setUnlockOpen(true) : null}
          />
        </PageContainer>
      </StageBody>

      {drawerCell && (
        <CellDecisionDrawer
          row={drawerCell.row}
          docType={drawerCell.docType}
          cell={drawerCellData}
          currentDecision={drawerDecision}
          onClose={() => setDrawerCell(null)}
          onDecide={handleDecide}
          onClear={handleClearCellDecision}
          onEdit={handleEditCell}
        />
      )}

      <CorrectionModal
        open={!!correcting}
        onClose={() => setCorrecting(null)}
        label={correcting?.fieldKey}
        currentValue={correcting?.value}
        slotValues={{}}
        onSave={handleSaveCorrection}
      />

      {bulkScope && (
        <BulkDecisionMenu
          scope={bulkScope}
          onClose={() => setBulkScope(null)}
          onApply={applyBulk}
        />
      )}

      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlock={handleUnlock} />
    </StagePage>
  );
}
