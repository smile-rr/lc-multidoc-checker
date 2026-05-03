import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../shared/Spinner';
import { ActivityStrip } from '../shared/ActivityStrip';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useDocActions } from '../../hooks/useDocActions';
import { useDocExtracts } from '../../hooks/useDocExtracts';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { DocRail } from './parse/DocRail';
import { PageStrip } from './parse/PageStrip';
import { ParseViewer } from './parse/ParseViewer';
import { FieldsPanel } from './parse/FieldsPanel';
import { CorrectionModal } from './parse/CorrectionModal';

const OFFICER_ID = 'A. Wijaya';

/**
 * Stage 1 — Parse. Three-pane shell (DocRail / Viewer / FieldsPanel).
 * Continue gate: every doc.parse_status === 'REVIEWED' (or DEV MODE).
 */
export function ParsePanel({ session, stagesCompleted, events, refresh, onContinue }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;
  const docs = useMemo(() =>
    (session?.documents ?? []).filter(d => d.doc_type !== 'UNKNOWN' && d.doc_type !== 'LC'),
    [session?.documents]);

  const [activeId, setActiveId] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [correcting, setCorrecting] = useState(null);

  const { markReviewed, correct } = useDocActions(sessionId);
  const { data: extracts, refresh: refreshExtracts } = useDocExtracts(sessionId, activeId);

  // Default-active to first doc, then re-anchor when docs list changes.
  useEffect(() => {
    if (docs.length === 0) { setActiveId(null); return; }
    if (!activeId || !docs.find(d => d.id === activeId)) {
      setActiveId(docs[0].id);
    }
  }, [docs, activeId]);

  // Reset page when doc changes.
  useEffect(() => { setPage(1); setPages(0); }, [activeId]);

  // Keyboard nav for doc + page.
  useKeyboardNav({
    onDocPrev: () => {
      const i = docs.findIndex(d => d.id === activeId);
      if (i > 0) setActiveId(docs[i - 1].id);
    },
    onDocNext: () => {
      const i = docs.findIndex(d => d.id === activeId);
      if (i >= 0 && i < docs.length - 1) setActiveId(docs[i + 1].id);
    },
    onPagePrev: () => setPage(p => Math.max(1, p - 1)),
    onPageNext: () => setPage(p => (pages > 0 ? Math.min(pages, p + 1) : p + 1)),
  });

  const activeDoc = docs.find(d => d.id === activeId);
  const allReviewed = docs.length > 0 && docs.every(d => d.parse_status === 'REVIEWED');
  const canContinue = devMode || allReviewed;
  const remaining = docs.filter(d => d.parse_status !== 'REVIEWED').length;
  const parseDone = stagesCompleted?.has('parse');

  const handleMarkReviewed = async () => {
    if (!activeDoc) return;
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
    await correct(activeDoc.id, correcting.key, {
      value, issueKind, note, officerId: OFFICER_ID,
    });
    await refreshExtracts();
    setCorrecting(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="px-6 py-3 bg-white border-b border-line flex items-center gap-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">STAGE 1</div>
          <div className="text-[15px] font-semibold tracking-tight">
            Parse
            {activeDoc && pages > 1 && <> · Page {page} of {pages}</>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] flex items-center gap-1.5 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full ${remaining === 0 ? 'bg-status-green' : 'bg-status-gold'}`} />
            <span className={remaining === 0 ? 'text-status-green' : 'text-status-gold'}>
              {docs.length - remaining}/{docs.length} reviewed
              {remaining > 0 && ` · ${remaining} remaining`}
            </span>
          </span>
          {!parseDone && <Spinner size="sm" label="extracting…" />}
          {devMode && remaining > 0 && (
            <button
              onClick={handleMarkAllReviewed}
              className="text-[11px] px-3 py-1.5 rounded-[6px] bg-status-gold text-white hover:bg-status-gold/80"
            >
              ⚡ Mark all reviewed
            </button>
          )}
          <RerunButton sessionId={sessionId} stage="parse" devMode={devMode} />
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className={`px-4 py-1.5 rounded-[8px] text-[12px]
              ${canContinue ? 'bg-navy-1 text-white hover:bg-navy-2' : 'bg-line text-muted cursor-not-allowed'}`}
          >
            Continue to Reconcile →
          </button>
        </div>
      </div>

      <div className="px-6 py-2 border-b border-line bg-white">
        <ActivityStrip
          events={events}
          filter={(m) => m.type === 'ExtractionProgress'}
          active={!parseDone}
          prefix="Parse activity:"
        />
      </div>

      {docs.length === 0 ? (
        <div className="p-8 text-center text-muted text-sm">
          No extractable documents in this session yet.
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <DocRail docs={docs} activeId={activeId} onActive={setActiveId} />

          <div className="flex-1 flex flex-col min-w-0 border-r border-line">
            {pages > 1 && <PageStrip pages={pages} activePage={page} onPage={setPage} />}
            <div className="flex-1 overflow-auto bg-slate2">
              <ParseViewer sessionId={sessionId} doc={activeDoc} page={page} onNumPages={setPages} />
            </div>
          </div>

          <FieldsPanel
            doc={activeDoc}
            extracts={extracts}
            events={events}
            devMode={devMode}
            onCorrect={(args) => setCorrecting(args)}
            onMarkReviewed={handleMarkReviewed}
          />
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
    </div>
  );
}
