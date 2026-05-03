import React, { useState } from 'react';
import { PipelineNav } from './PipelineNav';
import { EventHistory } from '../shared/EventHistory';
import { StatusPill } from '../ui/StatusPill';
import { CountChip } from '../ui/CountChip';

/**
 * Two-tier session chrome.
 *
 * Tier 1: breadcrumb · session-id (click-to-copy) · STATUS · docs (right)
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
          {sessionId && (
            <button
              onClick={onCopyId}
              title={copied ? 'Copied!' : 'Click to copy session ID'}
              className={`group inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border transition-all duration-200 active:scale-95 ${
                copied
                  ? 'border-teal-2 bg-teal-1/10 text-teal-1 shadow-sm'
                  : 'border-line bg-slate2 text-muted hover:border-teal-2 hover:bg-paper hover:text-teal-1 hover:shadow-sm'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l3.5 3.5L13 5" />
                  </svg>
                  <span>copied</span>
                </>
              ) : (
                <>
                  <span className="text-teal-2 group-hover:text-teal-1 transition-colors">#</span>
                  <span className="tracking-wider">{String(sessionId).slice(0, 8)}</span>
                  <svg className="w-3 h-3 opacity-0 -ml-0.5 group-hover:opacity-60 group-hover:ml-0 transition-all" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="5" width="8" height="8" rx="1.5" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                  </svg>
                </>
              )}
            </button>
          )}
          <StatusPill status={sessionStatus} compliant={compliant} />
          <CountChip n={docCount} unit="docs" />
          {sessionId && events && <EventHistory events={events} />}
        </div>
      </div>
    </div>
  );
}
