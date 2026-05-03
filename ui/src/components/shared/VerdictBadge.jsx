import React from 'react';

const STYLES = {
  PASS:           'bg-status-greenSoft text-status-green border-[#86efac]',
  FAIL:           'bg-status-redSoft text-status-red border-[#fca5a5]',
  DOUBTS:         'bg-status-goldSoft text-status-gold border-[#fcd34d]',
  NOT_APPLICABLE: 'bg-gray-100 text-muted border-line',
  MATCH:          'bg-status-greenSoft text-status-green border-[#86efac]',
  DISCREPANCY:    'bg-status-redSoft text-status-red border-[#fca5a5]',
  TOLERANCE:      'bg-status-goldSoft text-status-gold border-[#fcd34d]',
  NA:             'bg-gray-100 text-muted border-line',
};

export function VerdictBadge({ verdict }) {
  const style = STYLES[verdict] ?? 'bg-gray-100 text-muted border-line';
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${style}`}>
      {verdict}
    </span>
  );
}
