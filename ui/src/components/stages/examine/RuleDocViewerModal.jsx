import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ParseViewer } from '../parse/ParseViewer';
import { Mt700TextViewer } from '../parse/Mt700TextViewer';
import { LcFieldsPanel } from '../parse/LcFieldsPanel';
import { useDocExtracts } from '../../../hooks/useDocExtracts';
import { useLc } from '../../../hooks/useLc';
import { docTypeMeta } from '../../../constants/docTypes';
import { extractValue, extractConf } from '../../../lib/fieldEnvelope';

/**
 * Reference popup invoked from the RuleDrawer when an officer clicks a scoped
 * DocTypeBadge. Shows the original document (PDF or MT700 text) on the left
 * and its parsed fields on the right — mirroring the Parse-stage workbench
 * but read-only and without correction affordances.
 *
 * One modal handles all scope docs in the rule (LC + INV + BOL + PKL + …).
 * Tabs at the top switch between them; the clicked doc is the default tab.
 */
export function RuleDocViewerModal({ open, onClose, session, scope, initialDocType }) {
  const tabs = useMemo(() => {
    if (!session) return [];
    const docs = session.documents || [];
    const lc = docs.find(d => d.doc_type === 'LC');
    // LC is the master reference for every rule — always pin it first if the
    // session has one, regardless of whether `scope` lists it.
    const out = [];
    if (lc) out.push({ doc: lc, label: 'LC (MT700)', isLc: true });
    const seen = new Set(['LC']);
    for (const dt of scope || []) {
      if (seen.has(dt)) continue;
      seen.add(dt);
      const match = docs.find(d => d.doc_type === dt);
      if (match) out.push({ doc: match, label: docTypeMeta(dt).name, isLc: false });
    }
    return out;
  }, [session, scope]);

  // Pick initial tab on first open; thereafter, user controls activeIdx — we
  // do NOT auto-revert when the modal stays open. Once the modal closes and
  // re-opens (with a possibly different initialDocType), we re-seed.
  const [activeIdx, setActiveIdx] = useState(0);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const i = tabs.findIndex(t => t.doc?.doc_type === initialDocType);
      setActiveIdx(i >= 0 ? i : 0);
    }
    wasOpenRef.current = open;
  }, [open, initialDocType, tabs]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const active = tabs[activeIdx];

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/45 flex items-stretch p-6"
      onClick={onClose}
    >
      <div
        className="m-auto bg-white rounded-[10px] shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(1280px, 100%)', height: 'calc(100vh - 48px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — tabs row */}
        <div className="px-5 py-2.5 border-b border-line flex items-center gap-3 shrink-0 bg-slate2/50">
          <span className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono">REFERENCE</span>
          <span className="text-[11px] text-navy-1 font-mono">source documents · read-only</span>
          <div className="flex-1 flex items-center gap-1 ml-4 overflow-x-auto">
            {tabs.map((t, i) => {
              const meta = docTypeMeta(t.doc.doc_type);
              const isActive = i === activeIdx;
              return (
                <button
                  key={t.doc.id}
                  onClick={() => setActiveIdx(i)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-navy-1 text-white'
                      : 'border border-line text-muted hover:text-navy-1 hover:bg-white'
                  }`}
                  style={!isActive ? { background: meta.color + '08' } : undefined}
                >
                  <span>{meta.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-navy-1 text-[14px] leading-none px-1"
            title="Close (Esc)"
          >✕</button>
        </div>

        {/* Body — left: source, right: parsed fields */}
        {tabs.length === 0 ? (
          <div className="flex-1 grid place-items-center text-[12px] text-muted">
            No documents to preview for this rule.
          </div>
        ) : active.isLc ? (
          <LcTabBody sessionId={session?.id} />
        ) : (
          <DocTabBody sessionId={session?.id} doc={active.doc} />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Tab bodies
// ────────────────────────────────────────────────────────────────────

function DocTabBody({ sessionId, doc }) {
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const { data: extracts } = useDocExtracts(sessionId, doc?.id);
  const fields = extracts?.fields ?? {};
  const labels = extracts?.fieldLabels ?? {};
  const keys = Object.keys(fields);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 border-r border-line">
        {pages > 1 && (
          <div className="px-3 py-1.5 border-b border-line bg-white flex items-center gap-2 text-[11px] font-mono">
            <span className="text-muted">page</span>
            <button
              className="px-1.5 rounded border border-line hover:bg-slate2 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >‹</button>
            <span>{page} / {pages}</span>
            <button
              className="px-1.5 rounded border border-line hover:bg-slate2 disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage(p => Math.min(pages, p + 1))}
            >›</button>
          </div>
        )}
        <div className="flex-1 overflow-auto bg-slate2">
          <ParseViewer sessionId={sessionId} doc={doc} page={page} onNumPages={setPages} />
        </div>
      </div>
      <div className="w-[420px] shrink-0 overflow-auto bg-white">
        <div className="px-4 py-2.5 border-b border-line bg-slate2/50">
          <div className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono">EXTRACTED FIELDS</div>
          <div className="text-[10px] text-muted font-mono mt-0.5">{keys.length} field{keys.length === 1 ? '' : 's'} · consensus value</div>
        </div>
        {keys.length === 0 ? (
          <div className="p-4 text-[11px] text-muted italic">No fields extracted.</div>
        ) : (
          <ul className="divide-y divide-line/40">
            {keys.map(k => {
              const fv = fields[k];
              const v = extractValue(fv);
              const conf = extractConf(fv);
              return (
                <li key={k} className="px-4 py-2 grid grid-cols-[140px_1fr_auto] gap-2 items-baseline text-[11px]">
                  <span className="text-navy-1" title={k}>{labels[k] ?? k}</span>
                  <span className="font-mono text-navy-1 break-words">{String(v ?? '—')}</span>
                  {conf != null && (
                    <span className="text-[9px] font-mono text-muted">{(conf * 100).toFixed(0)}%</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function LcTabBody({ sessionId }) {
  const { data, loading } = useLc(sessionId);
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 border-r border-line">
        <div className="flex-1 overflow-auto bg-slate2">
          <Mt700TextViewer text={data?.text} warnings={data?.warnings} />
        </div>
      </div>
      <LcFieldsPanel data={data} loading={loading} width={420} />
    </div>
  );
}
