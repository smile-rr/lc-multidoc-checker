import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../shared/Spinner';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useDocActions } from '../../hooks/useDocActions';
import { useDocExtracts } from '../../hooks/useDocExtracts';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { useLc } from '../../hooks/useLc';
import { sortByDocType } from '../../constants/docTypes';
import { DocRail } from './parse/DocRail';
import { PageStrip } from './parse/PageStrip';
import { ParseViewer } from './parse/ParseViewer';
import { FieldsPanel } from './parse/FieldsPanel';
import { LcFieldsPanel } from './parse/LcFieldsPanel';
import { Mt700TextViewer } from './parse/Mt700TextViewer';
import { CorrectionModal } from './parse/CorrectionModal';
import { ResizeHandle } from './parse/ResizeHandle';
import { OFFICER_ID } from '../../lib/officer';
import { StagePage } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { DevShortcutButton, GhostButton } from '../ui/Button';

const STORAGE_W_KEY = 'lcv2-parse-fields-width';
const STORAGE_SWAP_KEY = 'lcv2-parse-lc-swap';

/**
 * Stage 1 — Parse. Three-pane workbench.
 *
 * Layout: DocRail (64) · Viewer (flex) · ResizeHandle · FieldsPanel (resizable)
 * Right pane width is user-resizable (drag handle) and persisted in localStorage.
 *
 * MT700/LC pinned at top of rail; selecting it swaps in Mt700TextViewer +
 * LcFieldsPanel. The layout-swap toggle (LC view only) flips the source/fields
 * sides for officers who prefer parsed-on-left like v1.
 *
 * Auto-refresh: when SSE marks Parse stage complete, useLc re-fetches so the
 * MT700 fields populate without the officer clicking another doc and back.
 */
export function ParsePanel({ session, stagesCompleted, events, refresh, onContinue }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const lcDoc = useMemo(
    () => (session?.documents ?? []).find(d => d.doc_type === 'LC') ?? null,
    [session?.documents]
  );
  const docs = useMemo(() =>
    sortByDocType((session?.documents ?? []).filter(d => d.doc_type !== 'UNKNOWN' && d.doc_type !== 'LC')),
    [session?.documents]);

  const [activeId, setActiveId] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [correcting, setCorrecting] = useState(null);

  // Right-pane width: defaults to 50/50 of available space on first paint.
  // Once the officer drags the handle the pixel value persists in localStorage.
  // null = "use 50% of container" (initial state before measurement / no saved pref)
  const splitRef = useRef(null);
  const [rightWidth, setRightWidth] = useState(() => {
    const v = parseInt(localStorage.getItem(STORAGE_W_KEY) || '', 10);
    return Number.isFinite(v) && v >= 360 ? v : null;
  });

  // Measure container on mount and set default to half (minus the DocRail).
  useEffect(() => {
    if (rightWidth != null || !splitRef.current) return;
    const total = splitRef.current.getBoundingClientRect().width;
    if (total > 0) {
      // DocRail is 64px; split remaining space 50/50.
      setRightWidth(Math.round((total - 64) / 2));
    }
  }, [rightWidth]);

  // Recompute on window resize while still at "default" (no manual drag yet).
  useEffect(() => {
    const onResize = () => {
      if (localStorage.getItem(STORAGE_W_KEY)) return; // user picked a width — respect it
      if (!splitRef.current) return;
      const total = splitRef.current.getBoundingClientRect().width;
      if (total > 0) setRightWidth(Math.round((total - 64) / 2));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist only when the officer manually drags (not on the auto 50/50 default).
  const setRightWidthByDrag = (w) => {
    setRightWidth(w);
    localStorage.setItem(STORAGE_W_KEY, String(w));
  };

  const [lcSwap, setLcSwap] = useState(() => localStorage.getItem(STORAGE_SWAP_KEY) === '1');
  useEffect(() => { localStorage.setItem(STORAGE_SWAP_KEY, lcSwap ? '1' : '0'); }, [lcSwap]);

  const { markReviewed, correct } = useDocActions(sessionId);
  const isLcActive = lcDoc && activeId === lcDoc.id;
  const { data: extracts, refresh: refreshExtracts } = useDocExtracts(sessionId, isLcActive ? null : activeId);
  const { data: lcData, loading: lcLoading, refresh: refreshLc } = useLc(sessionId);

  // Auto-refresh LC source when Parse stage completes (LC fields populate without nav).
  const parseDone = stagesCompleted?.has('parse');
  useEffect(() => {
    if (parseDone) refreshLc();
  }, [parseDone, refreshLc]);

  // Default-active to LC if present, else first doc.
  useEffect(() => {
    if (lcDoc && !activeId) { setActiveId(lcDoc.id); return; }
    if (!lcDoc && docs.length === 0) { setActiveId(null); return; }
    if (!lcDoc && (!activeId || (!docs.find(d => d.id === activeId)))) {
      setActiveId(docs[0].id);
    }
  }, [lcDoc, docs, activeId]);

  useEffect(() => { setPage(1); setPages(0); }, [activeId]);

  const navList = useMemo(() => lcDoc ? [lcDoc, ...docs] : docs, [lcDoc, docs]);
  useKeyboardNav({
    onDocPrev: () => {
      const i = navList.findIndex(d => d.id === activeId);
      if (i > 0) setActiveId(navList[i - 1].id);
    },
    onDocNext: () => {
      const i = navList.findIndex(d => d.id === activeId);
      if (i >= 0 && i < navList.length - 1) setActiveId(navList[i + 1].id);
    },
    onPagePrev: () => setPage(p => Math.max(1, p - 1)),
    onPageNext: () => setPage(p => (pages > 0 ? Math.min(pages, p + 1) : p + 1)),
  });

  const activeDoc = navList.find(d => d.id === activeId);
  const allReviewed = docs.length > 0 && docs.every(d => d.parse_status === 'REVIEWED');
  const canContinue = devMode || allReviewed;
  const remaining = docs.filter(d => d.parse_status !== 'REVIEWED').length;

  const handleMarkReviewed = async () => {
    if (!activeDoc || isLcActive) return;
    await markReviewed(activeDoc.id, OFFICER_ID);
    await refresh?.();
  };

  const handleMarkAllReviewed = async () => {
    for (const d of docs) {
      if (d.parse_status !== 'REVIEWED') await markReviewed(d.id, OFFICER_ID);
    }
    await refresh?.();
  };

  const handleSaveCorrection = async ({ value, issueKind, note }) => {
    if (!correcting) return;
    await correct(activeDoc.id, correcting.key, { value, issueKind, note, officerId: OFFICER_ID });
    await refreshExtracts();
    setCorrecting(null);
  };

  const meta = (
    <span className="text-[11px] flex items-center gap-1.5 font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${remaining === 0 ? 'bg-status-green' : 'bg-status-gold'}`} />
      <span className={remaining === 0 ? 'text-status-green' : 'text-status-gold'}>
        {docs.length - remaining}/{docs.length} reviewed
        {remaining > 0 && ` · ${remaining} remaining`}
      </span>
      {!isLcActive && activeDoc && pages > 1 && <span className="text-muted">· page {page}/{pages}</span>}
      {!parseDone && <Spinner size="sm" />}
    </span>
  );

  // Left/right pane elements (so we can swap them when LC is active).
  const leftPane = isLcActive
    ? <Mt700TextViewer text={lcData?.text} warnings={lcData?.warnings} />
    : <ParseViewer sessionId={sessionId} doc={activeDoc} page={page} onNumPages={setPages} />;

  const rightPane = isLcActive
    ? <LcFieldsPanel data={lcData} loading={lcLoading} width={rightWidth} />
    : <FieldsPanel
        doc={activeDoc}
        extracts={extracts}
        events={events}
        onCorrect={(args) => setCorrecting(args)}
        onMarkReviewed={handleMarkReviewed}
        width={rightWidth}
      />;

  return (
    <StagePage>
      <StageToolbar
        title="Parse"
        meta={meta}
        actions={
          <>
            {isLcActive && (
              <GhostButton
                onClick={() => setLcSwap(s => !s)}
                title="Swap MT700 source / parsed fields sides"
              >
                ⇄ swap
              </GhostButton>
            )}
            {devMode && remaining > 0 && (
              <DevShortcutButton onClick={handleMarkAllReviewed}>⚡ Mark all reviewed</DevShortcutButton>
            )}
            <RerunButton sessionId={sessionId} stage="parse" devMode={devMode} />
            <StageNavButtons stage="parse" onContinue={onContinue} canContinue={canContinue} />
          </>
        }
      />

      {!lcDoc && docs.length === 0 ? (
        <div className="p-8 text-center text-muted text-sm">
          No documents in this session yet.
        </div>
      ) : (
        <div ref={splitRef} className="flex flex-1 min-h-0 overflow-hidden">
          <DocRail lcEntry={lcDoc} docs={docs} activeId={activeId} onActive={setActiveId} />

          {isLcActive && lcSwap ? (
            // Swapped layout (LC view only): parsed fields on LEFT, raw text on RIGHT
            <>
              {rightPane}
              <ResizeHandle width={rightWidth} onResize={setRightWidthByDrag} />
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-auto bg-slate2">{leftPane}</div>
              </div>
            </>
          ) : (
            // Default layout: source/PDF on LEFT, parsed fields on RIGHT
            <>
              <div className="flex-1 flex flex-col min-w-0 border-r border-line">
                {!isLcActive && pages > 1 && <PageStrip pages={pages} activePage={page} onPage={setPage} />}
                <div className="flex-1 overflow-auto bg-slate2">{leftPane}</div>
              </div>
              <ResizeHandle width={rightWidth} onResize={setRightWidthByDrag} />
              {rightPane}
            </>
          )}
        </div>
      )}

      <CorrectionModal
        open={!!correcting}
        onClose={() => setCorrecting(null)}
        label={correcting?.key}
        currentValue={correcting?.value}
        slotValues={correcting?.slotValues ?? {}}
        onSave={handleSaveCorrection}
      />
    </StagePage>
  );
}
