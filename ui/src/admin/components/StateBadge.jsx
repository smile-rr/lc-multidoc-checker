import React from 'react';

const styles = {
  DRAFT:     'bg-status-goldSoft text-status-gold border-status-gold/40',
  IN_REVIEW: 'bg-status-blueSoft text-status-blue border-status-blue/40',
  SHADOW:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  STAGED:    'bg-purple-50 text-purple-700 border-purple-200',
  PUBLISHED: 'bg-status-greenSoft text-status-green border-status-green/40',
  ARCHIVED:  'bg-slate-100 text-slate-500 border-slate-300',
};

const labels = {
  DRAFT: 'Draft', IN_REVIEW: 'In Review', SHADOW: 'Shadow',
  STAGED: 'Staged', PUBLISHED: 'Published', ARCHIVED: 'Archived',
};

export function StateBadge({ state, className = '' }) {
  if (!state) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${styles[state] || styles.ARCHIVED} ${className}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      {labels[state] || state}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const map = {
    CRITICAL: 'bg-status-redSoft text-status-red border-status-red/30',
    MAJOR: 'bg-status-goldSoft text-status-gold border-status-gold/30',
    MINOR: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase rounded border ${map[severity] || map.MINOR}`}>
      {severity}
    </span>
  );
}

export function TierBadge({ type }) {
  const map = {
    PROGRAMMATIC: 'bg-slate-50 text-slate-700 border-slate-300',
    AGENT:        'bg-teal-1/10 text-teal-1 border-teal-1/30',
    AGENT_TOOL:   'bg-status-blueSoft text-status-blue border-status-blue/30',
    AGENTIC:      'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase rounded border ${map[type] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {type?.replace('_', '·')}
    </span>
  );
}
