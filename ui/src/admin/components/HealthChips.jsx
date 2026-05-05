import React from 'react';

// Color thresholds: green / amber / red based on signal direction
const tone = (val, thresholds, invert = false) => {
  if (val == null) return 'slate';
  const [good, warn] = thresholds;
  if (invert) {
    if (val <= good) return 'green';
    if (val <= warn) return 'gold';
    return 'red';
  }
  if (val >= good) return 'green';
  if (val >= warn) return 'gold';
  return 'red';
};

const PALETTE = {
  green:  'bg-status-greenSoft text-status-green border-status-green/40',
  gold:   'bg-status-goldSoft  text-status-gold  border-status-gold/40',
  red:    'bg-status-redSoft   text-status-red   border-status-red/40',
  slate:  'bg-slate-50 text-slate-500 border-slate-200',
};

export function HealthChips({ signals = {}, layout = 'inline' }) {
  if (!signals || Object.keys(signals).length === 0) {
    return <span className="text-[10px] text-muted italic">no telemetry</span>;
  }

  const items = [
    { key: 'eval_pass_rate',     label: 'eval',     value: signals.eval_pass_rate,     fmt: (v) => `${(v * 100).toFixed(0)}%`,  thresh: [0.95, 0.85] },
    { key: 'override_rate',      label: 'override', value: signals.override_rate,      fmt: (v) => `${(v * 100).toFixed(0)}%`,  thresh: [0.05, 0.10], invert: true },
    { key: 'doubts_rate',        label: 'doubts',   value: signals.doubts_rate,        fmt: (v) => `${(v * 100).toFixed(0)}%`,  thresh: [0.05, 0.10], invert: true },
    { key: 'p95_latency_ms',     label: 'p95',      value: signals.p95_latency_ms,     fmt: (v) => v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`, thresh: [200, 2000], invert: true },
    { key: 'cost_usd_per_check', label: 'cost',     value: signals.cost_usd_per_check, fmt: (v) => v === 0 ? 'free' : `$${v.toFixed(4)}`, thresh: [0.001, 0.005], invert: true },
  ];

  if (layout === 'dots') {
    return (
      <span className="inline-flex items-center gap-1">
        {items.map((it) => {
          const t = tone(it.value, it.thresh, it.invert);
          return (
            <span
              key={it.key}
              title={`${it.label}: ${it.value == null ? '—' : it.fmt(it.value)}`}
              className={`w-1.5 h-1.5 rounded-full ${
                t === 'green' ? 'bg-status-green' :
                t === 'gold'  ? 'bg-status-gold'  :
                t === 'red'   ? 'bg-status-red'   : 'bg-slate-300'
              }`}
            />
          );
        })}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => {
        if (it.value == null) return null;
        const t = tone(it.value, it.thresh, it.invert);
        return (
          <span key={it.key} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${PALETTE[t]}`}>
            {it.label} {it.fmt(it.value)}
          </span>
        );
      })}
    </div>
  );
}
