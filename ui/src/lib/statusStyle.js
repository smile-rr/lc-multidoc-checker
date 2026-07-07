// Single source of truth for session-status visual mapping.
// Used by StatusPill, HistoryDropdown row dot, and any other status display.

export function statusStyle(status, compliant) {
  if (status === 'COMPLETED') {
    if (compliant === true)  return { tone: 'green', label: 'COMPLIANT', dot: 'bg-status-green' };
    if (compliant === false) return { tone: 'red',   label: 'DISCREPANT', dot: 'bg-status-red' };
    return { tone: 'gold', label: 'COMPLETED', dot: 'bg-status-gold' };
  }
  if (status === 'RUNNING')   return { tone: 'teal', label: 'RUNNING',   dot: 'bg-teal-1 animate-pulse' };
  if (status === 'UPLOAD')        return { tone: 'teal', label: 'UPLOAD',        dot: 'bg-teal-1' };
  if (status === 'SEGMENTATION')    return { tone: 'teal', label: 'SEGMENTATION',    dot: 'bg-teal-1' };
  if (status === 'QUEUED')    return { tone: 'gray', label: 'QUEUED',    dot: 'bg-[#a1a1a6]' };
  if (status === 'CANCELLED') return { tone: 'gold', label: 'CANCELLED', dot: 'bg-status-gold' };
  if (status === 'FAILED')    return { tone: 'red',  label: 'FAILED',    dot: 'bg-status-red' };
  return { tone: 'gray', label: status || '', dot: 'bg-[#a1a1a6]' };
}

export const TONE_CLASS = {
  green: 'bg-status-green/15 text-status-green',
  red:   'bg-status-red/15 text-status-red',
  gold:  'bg-status-gold/15 text-status-gold',
  teal:  'bg-teal-1/15 text-teal-1',
  blue:  'bg-status-blue/15 text-status-blue',
  gray:  'bg-[#a1a1a6]/15 text-[#a1a1a6]',
};
