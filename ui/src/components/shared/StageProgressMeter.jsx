import React from 'react';

/**
 * Compact stage state indicator for StageToolbar `meta` slots.
 *
 * Three visual modes:
 *   pending  — returns null (caller decides whether to render anything pre-run)
 *   running  — pulsing dot (gold while fresh, dim when stale > 5s) + label
 *              + optional M/N counter + sub-step + elapsed since last event
 *   complete — green ✓ + label + optional total
 *
 * No standalone <Spinner>. The dot itself carries the "alive" signal; if the
 * backend goes quiet > 5s the dot dims so the officer can tell something
 * may be wrong without us pretending progress is still happening.
 */
export function StageProgressMeter({
  phase,
  label,
  sub,
  idx,
  total,
  secsSinceLast,
  isStale,
  // Optional override shown in `complete` mode in place of the default total
  completeSummary,
}) {
  if (phase === 'pending') return null;

  if (phase === 'complete') {
    return (
      <span className="text-[11px] font-mono flex items-center gap-1.5 text-status-green">
        <span aria-hidden="true">✓</span>
        <span>{label}</span>
        {completeSummary
          ? <span className="text-muted">· {completeSummary}</span>
          : (total != null && <span className="text-muted">· {total}/{total}</span>)}
      </span>
    );
  }

  // running
  const dotClass = isStale
    ? 'bg-line'                         // stale: dim, no pulse
    : 'bg-status-gold animate-pulse';   // fresh: gold pulse

  return (
    <span className="text-[11px] font-mono flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className={isStale ? 'text-muted' : 'text-status-gold'}>
        {label}
      </span>
      {idx != null && total != null && (
        <span className={isStale ? 'text-muted' : 'text-status-gold'}>
          · {idx}/{total}
        </span>
      )}
      {sub && <span className="text-muted truncate max-w-[280px]">· {sub}</span>}
      {secsSinceLast != null && secsSinceLast >= 1 && (
        <span className="text-muted">· {secsSinceLast.toFixed ? secsSinceLast.toFixed(0) : secsSinceLast}s</span>
      )}
    </span>
  );
}
