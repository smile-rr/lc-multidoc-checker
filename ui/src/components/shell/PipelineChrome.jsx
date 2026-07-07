import React from 'react';
import { useLocation } from 'react-router-dom';
import { PipelineNav } from './PipelineNav';

/**
 * Upload-stage breadcrumb on the home route. Session routes render the full
 * bar inside SessionStatusBar (with upload marked complete).
 */
export function PipelineChrome() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/admin') || loc.pathname.startsWith('/session/')) {
    return null;
  }
  if (loc.pathname !== '/') return null;

  return (
    <div className="border-b border-line bg-paper shrink-0">
      <PipelineNav
        activeStage="upload"
        completedStages={new Set()}
        reachable={new Set(['upload'])}
      />
    </div>
  );
}
