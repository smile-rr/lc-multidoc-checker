import React, { useState } from 'react';
import { PipelineNav } from './PipelineNav';
import { EventHistory } from '../shared/EventHistory';
import { StatusPill } from '../ui/StatusPill';
import { CountChip } from '../ui/CountChip';

/**
 * Two-tier session chrome.
 *
 * Tier 1: breadcrumb · STATUS (middle) · docs · session-id (click-to-copy on right)
 * Tier 2 (always when in a session): events ▾ audit drawer trigger (right)
 */
export function SessionStatusBar({
  activeStage, completedStages, reachable, onSelect,
  events, sessionId, docCount, sessionStatus, compliant,
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

  return (
    <div className="border-b border-line bg-paper shrink-0">
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
          {sessionId && events && <EventHistory events={events} />}
          {sessionId && (
            <button
              onClick={onCopyId}
              title={copied ? 'Copied!' : 'Click to copy session ID'}
              className="text-[11px] font-mono text-muted hover:text-navy-1 hover:bg-slate2 px-2 py-1 rounded transition-colors"
            >
              {copied ? '✓ copied' : `#${String(sessionId).slice(0, 8)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
