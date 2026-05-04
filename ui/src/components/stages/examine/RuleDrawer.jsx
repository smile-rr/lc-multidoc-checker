import React, { useState } from 'react';
import { SeverityChip } from '../../shared/SeverityChip';
import { AttentionChip } from '../../shared/AttentionChip';
import { DocTypeBadge } from '../../shared/DocTypeBadge';
import { EvidencePanel } from './EvidencePanel';
import { OverrideForm } from './OverrideForm';
import { CitationChip } from './CitationChip';
import { RuleDocViewerModal } from './RuleDocViewerModal';

const VERDICT_PILL = {
  PASS:           { fg: '#1a7a43', bg: '#ecfdf5', l: 'PASS',     glyph: '✓' },
  FAIL:           { fg: '#cc0011', bg: '#fee2e2', l: 'FAIL',     glyph: '✕' },
  DOUBTS:         { fg: '#8a5700', bg: '#fef9c3', l: 'DOUBTS',   glyph: '?' },
  NEEDS_REVIEW:   { fg: '#8a5700', bg: '#fef9c3', l: 'REVIEW',   glyph: '⚠' },
  NOT_APPLICABLE: { fg: '#6e6e73', bg: '#f4f4f5', l: 'N/A',      glyph: '—' },
  PENDING:        { fg: '#6e6e73', bg: '#f5f5f7', l: 'pending…', glyph: '·' },
  FAILED:         { fg: '#b54708', bg: '#fff4ed', l: 'FAILED',   glyph: '!' },
};

/**
 * Right-side rule drawer — redesigned to lead with the *issue* and *why*,
 * not the wall of source text.
 *
 * Layout (top-to-bottom):
 *   1. Header — verdict pill + ruleId · severity · close
 *   2. Issue — one-paragraph narrative ("what's wrong, what to look at next")
 *   3. Sources — compact LC vs Document evidence table
 *   4. Authority — UCP/ISBP CitationChips with click-to-pin popovers
 *   5. Deep dive — collapsible: full UCP excerpt, raw evidence, tool calls,
 *      condition results
 *   6. Officer override panel — at the bottom, sticky
 */
export function RuleDrawer({ rule, width = 540, session, onClose, onOverride, onResetOverride }) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [docViewer, setDocViewer] = useState(null); // {docType} | null

  if (!rule) return null;
  const effective = rule.effectiveVerdict || rule.verdict;
  const v = VERDICT_PILL[effective] || VERDICT_PILL.PASS;
  const ov = rule.override;

  const isPending = effective === 'PENDING';
  const isNa = effective === 'NOT_APPLICABLE';
  const issueText = isNa
    ? null
    : isPending
      ? 'This rule has not been checked yet — verdict will appear here once execution completes.'
      : (rule.explanation || (effective === 'PASS'
          ? 'No discrepancy detected against the LC terms.'
          : 'No explanation captured for this verdict.'));

  return (
    <aside className="bg-white border-l border-line flex flex-col flex-shrink-0 overflow-hidden" style={{ width }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-line">
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] tracking-wider font-semibold"
            style={{ color: v.fg, background: v.bg }}
          >
            <span className="text-[12px] leading-none">{v.glyph}</span>
            <span>{v.l}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] text-navy-1 font-mono font-semibold">{rule.ruleId}</span>
              {rule.article && (
                <span className="text-[10px] text-muted font-mono">· {rule.article}</span>
              )}
              <SeverityChip severity={rule.severity} />
              {rule.checkType && (
                <span className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-mono border border-line text-muted">
                  {rule.checkType}
                </span>
              )}
              {(rule.scope || []).slice(0, 4).map(s => (
                <button
                  key={s}
                  onClick={() => setDocViewer({ docType: s })}
                  title={`Open ${s} source document`}
                  className="hover:brightness-95 active:brightness-90 transition rounded"
                >
                  <DocTypeBadge type={s} />
                </button>
              ))}
            </div>
            <div className="text-[13px] font-semibold tracking-tight leading-snug text-navy-1">{rule.label}</div>
            {(rule.attention || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {rule.attention.map(t => <AttentionChip key={t} tag={t} />)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1a6] hover:text-navy-1 text-[16px] leading-none shrink-0"
            title="Close (Esc)"
          >✕</button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* 1. ISSUE — what's wrong and why (top of drawer, leading content) */}
        {!isNa && (
          <Section eyebrow="ISSUE" tone={effective === 'FAIL' ? 'red' : effective === 'DOUBTS' ? 'gold' : effective === 'PASS' ? 'green' : 'neutral'}>
            <p className="text-[12px] leading-relaxed text-navy-1">{issueText}</p>
            {rule.confidence != null && rule.checkType !== 'PROGRAMMATIC' && (
              <div className="mt-2 text-[10px] font-mono text-muted">
                agent confidence · {(rule.confidence * 100).toFixed(0)}%
              </div>
            )}
          </Section>
        )}

        {/* 2. NA — why this rule didn't fire */}
        {isNa && (
          <Section eyebrow="WHY THIS RULE DIDN'T FIRE" tone="neutral">
            {(rule.triggerTrace && rule.triggerTrace.length > 0) ? (
              <ul className="text-[11px] space-y-1 font-mono">
                {rule.triggerTrace.map((line, i) => (
                  <li key={i} className="text-navy-1">{line}</li>
                ))}
              </ul>
            ) : (
              <div className="text-[11px] text-muted">{rule.explanation || 'No trace available.'}</div>
            )}
          </Section>
        )}

        {/* 3. SOURCES — what data the verdict was based on */}
        {!isPending && rule.evidence && (
          <Section eyebrow="SOURCES">
            <EvidencePanel evidence={rule.evidence} />
          </Section>
        )}

        {/* 4. AUTHORITY — UCP/ISBP citations as compact chips with popovers */}
        {(rule.ucpRefs?.length > 0 || rule.isbpRefs?.length > 0) && (
          <Section eyebrow="AUTHORITY">
            <div className="flex flex-wrap gap-1.5">
              {(rule.ucpRefs || []).map(c => (
                <CitationChip key={c.id} kind="UCP" cite={c} />
              ))}
              {(rule.isbpRefs || []).map(c => (
                <CitationChip key={c.id} kind="ISBP" cite={c} />
              ))}
            </div>
            <div className="mt-1.5 text-[9.5px] text-muted font-mono">
              hover for excerpt · click to pin
            </div>
          </Section>
        )}

        {/* 5. DEEP DIVE — collapsibles */}
        {(rule.ucpExcerpt || (rule.toolCalls?.length > 0) || (rule.conditionResults?.length > 0)) && (
          <div className="px-5 py-3 border-b border-line/50 space-y-2">
            <div className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono mb-1">DEEP DIVE</div>
            {rule.toolCalls?.length > 0 && (
              <Foldable title={`Tool calls · ${rule.toolCalls.length}`}>
                <ToolCallsList calls={rule.toolCalls} />
              </Foldable>
            )}
            {rule.conditionResults?.length > 0 && (
              <Foldable title={`Condition results · ${rule.conditionResults.length}`}>
                <ConditionResultsList results={rule.conditionResults} />
              </Foldable>
            )}
            {rule.ucpExcerpt && (
              <Foldable title="Full UCP / ISBP excerpt">
                <pre className="text-[11px] font-mono whitespace-pre-wrap bg-slate2 border border-line rounded-sm px-3 py-2 text-navy-1">
                  {rule.ucpExcerpt}
                </pre>
              </Foldable>
            )}
          </div>
        )}

        {/* Officer override summary */}
        {ov && (
          <div className="px-5 py-3 border-b border-line/50 bg-status-blueSoft">
            <div className="text-[9px] tracking-[0.2em] uppercase text-status-blue mb-1.5 font-mono">OFFICER OVERRIDE</div>
            <div className="text-[11px]"><b>{ov.newStatus}</b> · reason: {ov.reason}</div>
            {ov.note && <div className="text-[11px] mt-1">{ov.note}</div>}
            {ov.flagged && (
              <div className="mt-1.5">
                <AttentionChip tag="FLAGGED" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer / actions ────────────────────────────────────────── */}
      <div className="px-5 py-3 border-t border-line bg-slate2">
        {!overrideOpen ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setOverrideOpen(true)}
              className="px-3 py-1.5 rounded text-[11px] border border-line hover:bg-white"
            >
              ✎ Override verdict
            </button>
            <button
              onClick={() => setOverrideOpen(true)}
              className="px-3 py-1.5 rounded text-[11px] border border-status-red text-status-red hover:bg-status-redSoft"
            >
              ⚑ Flag agent error
            </button>
            {ov && (
              <button
                onClick={() => onResetOverride(rule.ruleId)}
                className="px-3 py-1.5 rounded text-[11px] border border-line text-muted hover:bg-white"
              >
                ↻ Reset to system verdict
              </button>
            )}
            <span className="ml-auto text-[10px] text-muted font-mono">audit trail captures all actions</span>
          </div>
        ) : (
          <OverrideForm
            ruleId={rule.ruleId}
            currentVerdict={rule.verdict}
            initialFlagged={ov?.flagged}
            onSubmit={async (body) => {
              await onOverride(rule.ruleId, body);
              setOverrideOpen(false);
            }}
            onCancel={() => setOverrideOpen(false)}
          />
        )}
      </div>

      <RuleDocViewerModal
        open={!!docViewer}
        onClose={() => setDocViewer(null)}
        session={session}
        scope={rule.scope}
        initialDocType={docViewer?.docType}
      />
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function Section({ eyebrow, tone = 'neutral', children }) {
  const accent = {
    red:     'border-l-2 border-status-red    bg-status-redSoft/40',
    gold:    'border-l-2 border-status-gold   bg-status-goldSoft/40',
    green:   'border-l-2 border-status-green  bg-status-greenSoft/40',
    neutral: '',
  }[tone];
  return (
    <div className={`px-5 py-3 border-b border-line/50 ${accent}`}>
      <div className="text-[9px] tracking-[0.2em] uppercase text-muted font-mono mb-1.5">{eyebrow}</div>
      {children}
    </div>
  );
}

function Foldable({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line/60 rounded-sm bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono text-navy-1 hover:bg-slate2/40"
      >
        <span className="text-muted">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
      </button>
      {open && <div className="px-2.5 pb-2.5 pt-1">{children}</div>}
    </div>
  );
}

function ToolCallsList({ calls }) {
  return (
    <ol className="space-y-1.5 text-[11px] font-mono">
      {calls.map((c, i) => (
        <li key={i} className="border border-line/60 rounded-sm bg-slate2/40 p-2">
          <div className="text-navy-1 font-semibold">
            <span className="text-muted mr-1.5">{i + 1}.</span>{c.tool}
          </div>
          {c.args && (
            <div className="mt-1 text-muted text-[10px]">
              <span className="uppercase tracking-wider mr-1">args</span>
              {typeof c.args === 'object' ? JSON.stringify(c.args) : String(c.args)}
            </div>
          )}
          {c.result !== undefined && (
            <div className="mt-1 text-[10px]">
              <span className="uppercase tracking-wider text-muted mr-1">result</span>
              <span className="text-navy-1">
                {typeof c.result === 'object' ? JSON.stringify(c.result) : String(c.result)}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function ConditionResultsList({ results }) {
  return (
    <ul className="space-y-1.5 text-[11px]">
      {results.map((r, i) => {
        const verdict = (r.verdict || '').toUpperCase();
        const meta = VERDICT_PILL[verdict] || VERDICT_PILL.NOT_APPLICABLE;
        return (
          <li key={r.condition_id || r.conditionId || i} className="border border-line/60 rounded-sm bg-slate2/40 p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-mono text-muted">
                {r.condition_id || r.conditionId || `#${i + 1}`}
              </span>
              <span
                className="text-[9px] tracking-wider px-1.5 py-0.5 rounded font-semibold font-mono"
                style={{ color: meta.fg, background: meta.bg }}
              >
                {verdict || 'N/A'}
              </span>
              {r.confidence != null && (
                <span className="text-[9px] text-muted font-mono">
                  {(r.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {(r.condition_text || r.conditionText) && (
              <div className="text-muted text-[10px] mb-1 italic">
                {r.condition_text || r.conditionText}
              </div>
            )}
            {r.explanation && <div className="text-navy-1">{r.explanation}</div>}
          </li>
        );
      })}
    </ul>
  );
}
