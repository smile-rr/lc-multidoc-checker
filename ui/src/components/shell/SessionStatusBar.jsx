import React, { useState } from 'react';
import { PipelineNav } from './PipelineNav';
import { EventHistory } from '../shared/EventHistory';
import { StatusPill } from '../ui/StatusPill';
import { CountChip } from '../ui/CountChip';
// Cancel/abandon removed by design — sessions complete the running stage even
// if the user navigates away. Officer triggers the next stage explicitly.

/**
 * Two-tier session chrome.
 *
 * Tier 1: breadcrumb · STATUS (middle) · docs · session-id (click-to-copy on right)
 * Tier 2 (always when in a session): live activity (left) + events ▾ audit drawer (right)
 *
 * Design rationale:
 *   - Tier 1 = WHERE in the workflow + WHAT is the verdict (positional/static info)
 *   - Tier 2 = WHEN (temporal) — live progress + audit trail collocated
 *   - Audit trail is legally retained for LC checking; the drawer must remain
 *     accessible even after sign-off, so it lives in Tier 2 not Tier 1.
 */
export function SessionStatusBar({
  activeStage, completedStages, reachable, onSelect,
  events, currentActivity, sessionId, docCount, sessionStatus, compliant,
}) {
  const [copied, setCopied] = useState(false);

  const onCopyId = async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(String(sessionId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore — clipboard may be unavailable */ }
  };

  const isRunning = sessionStatus === 'RUNNING' || sessionStatus === 'INTAKE'
    || sessionStatus === 'PARSE' || sessionStatus === 'RECONCILE'
    || sessionStatus === 'EXAMINE' || sessionStatus === 'SIGNOFF';
  const awaiting = sessionStatus === 'AWAITING_OFFICER';
  const activity = formatActivity(currentActivity);
  const lastEvent = events?.length ? events[events.length - 1] : null;
  const fallbackText = isRunning
    ? (lastEvent ? formatEvent(lastEvent) : 'starting…')
    : awaiting ? `awaiting officer — click Continue to run next stage`
    : sessionStatus === 'COMPLETED' ? 'session complete'
    : sessionStatus === 'CANCELLED' ? 'session cancelled'
    : 'idle';

  return (
    <div className="border-b border-line bg-paper shrink-0">
      {/* Tier 1: breadcrumb · STATUS (middle) · docs · session-id (right) */}
      <div className="flex items-stretch">
        <PipelineNav
          activeStage={activeStage}
          completedStages={completedStages}
          reachable={reachable}
          onSelect={onSelect}
        />
        <div className="w-px bg-line shrink-0" />
        <div className="flex items-center gap-3 px-4 ml-auto">
          <StatusPill status={sessionStatus} compliant={compliant} />
          <CountChip n={docCount} unit="docs" />
          {sessionId && (
            <button
              onClick={onCopyId}
              title={copied ? 'Copied!' : 'Click to copy session ID'}
              className="text-[11px] font-mono text-muted hover:text-navy-1 hover:bg-slate2 px-2 py-1 rounded transition-colors"
            >
              {copied ? '✓ copied' : `#${String(sessionId).slice(0, 8)}`}
            </button>
          )}
          {/* No cancel button — sessions complete the running stage by design. */}
        </div>
      </div>

      {/* Tier 2: live activity (left) + events drawer (right) */}
      {sessionId && (
        <div className="border-t border-line bg-slate2 px-4 py-1 flex items-center gap-2 text-[11px] font-mono">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-teal-1 animate-pulse' : 'bg-line'}`} />
          <span className="text-muted shrink-0">{isRunning ? 'live' : ''}</span>
          <span className="text-navy-1 truncate flex-1">
            {activity || fallbackText}
          </span>
          <EventHistory events={events ?? []} />
        </div>
      )}
    </div>
  );
}

function formatActivity(msg) {
  if (!msg) return null;
  const data = msg.data || {};
  const { kind, text } = msg;
  if (kind === 'extract') return `${data.docType} · ${data.slot} · ${data.status}`;
  // Strip trailing "· (null)" / "(null)" that creeps in when checkType is null
  return (text || kind || null)?.replace(/\s*[·:]?\s*\(null\)\s*$/i, '');
}

function formatEvent(msg) {
  if (!msg) return null;
  const t = msg.type || '';
  const d = msg.data || {};
  if (t === 'ExtractionProgress') return `${d.docType} · ${d.slot} · ${d.status}`;
  if (t === 'RuleStarted') return `Rule ${d.index}/${d.total} · ${d.ruleId}${d.checkType ? ` (${d.checkType})` : ''}`;
  if (t === 'RuleChecked')  return `${d.ruleId} → ${d.verdict}`;
  if (t === 'StageStarted') return `${d.stageName} started`;
  if (t === 'StageCompleted') return `${d.stageName} complete`;
  if (t === 'StageRerun') return `↻ Re-running from ${d.fromStage}`;
  if (t === 'SessionCompleted') return `session complete`;
  return t;
}
