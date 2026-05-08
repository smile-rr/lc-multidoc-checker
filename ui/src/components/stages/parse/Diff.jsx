import React, { useMemo } from 'react';
import { diffChars, diffWordsWithSpace } from 'diff';

const CHAR_TYPES = new Set(['AMOUNT', 'INTEGER', 'DATE', 'CURRENCY_CODE']);

function pickTokenizer(fieldType) {
  return CHAR_TYPES.has(String(fieldType || '').toUpperCase()) ? diffChars : diffWordsWithSpace;
}

function isWS(s) {
  return /^\s+$/.test(s);
}

/**
 * Inline token-level diff of `value` vs `baseline`.
 *
 * mode="full" (default) — shows additions in green, removals in red strikethrough.
 *                         Use when you want to see what would have to change to
 *                         turn baseline into value.
 * mode="own"            — only renders tokens present in `value`. Tokens unique to
 *                         this side are highlighted; shared tokens are plain.
 *                         `tone` picks the highlight colour:
 *                           "green" — this side is the selected/winner
 *                           "red"   — this side is the loser / divergent
 *                           "gold"  — neutral
 */
export function Diff({ baseline, value, fieldType, mono = true, mode = 'full', tone = 'gold', className = '' }) {
  const ownClasses = {
    green: 'bg-status-greenSoft text-status-green border-b border-status-green',
    red:   'bg-status-redSoft text-status-red border-b border-status-red',
    gold:  'bg-status-goldSoft text-status-gold border-b border-status-gold',
  }[tone] || 'bg-status-goldSoft text-status-gold border-b border-status-gold';
  const parts = useMemo(() => {
    const fn = pickTokenizer(fieldType);
    return fn(String(baseline ?? ''), String(value ?? ''));
  }, [baseline, value, fieldType]);

  if (!baseline && !value) return <span className="text-muted">—</span>;

  return (
    <span className={`${mono ? 'font-mono' : ''} ${className}`}>
      {parts.map((p, i) => {
        if (p.added) {
          if (mode === 'own') {
            return (
              <span
                key={i}
                className={`${ownClasses} px-[1px]`}
                title="only on this side"
              >
                {isWS(p.value) ? <WSMark>{p.value}</WSMark> : p.value}
              </span>
            );
          }
          return (
            <span
              key={i}
              className="bg-status-greenSoft text-status-green border-b border-status-green px-[1px]"
              title="only in this slot"
            >
              {isWS(p.value) ? <WSMark>{p.value}</WSMark> : p.value}
            </span>
          );
        }
        if (p.removed) {
          if (mode === 'own') return null;   // suppress: we only render what THIS side has
          return (
            <span
              key={i}
              className="bg-status-redSoft text-status-red line-through decoration-status-red/60 px-[1px]"
              title="only in baseline"
            >
              {isWS(p.value) ? <WSMark>{p.value}</WSMark> : p.value}
            </span>
          );
        }
        return <span key={i}>{p.value}</span>;
      })}
    </span>
  );
}

function WSMark({ children }) {
  return (
    <>
      <span className="text-black/40">·</span>
      {children}
    </>
  );
}

/** Count of differing tokens for a small δ chip. */
export function diffCount(baseline, value, fieldType) {
  const fn = pickTokenizer(fieldType);
  return fn(String(baseline ?? ''), String(value ?? '')).filter(p => p.added || p.removed).length;
}

/** Tiny chip: green ✓ when identical, gold δN otherwise. */
export function DiffBadge({ baseline, value, fieldType }) {
  const same = String(baseline ?? '') === String(value ?? '');
  if (same) {
    return (
      <span className="text-[10px] tracking-wider text-teal-1 font-mono uppercase">✓ same</span>
    );
  }
  const n = diffCount(baseline, value, fieldType);
  return (
    <span className="text-[10px] tracking-wider text-status-gold font-mono uppercase">
      δ {n}
    </span>
  );
}
