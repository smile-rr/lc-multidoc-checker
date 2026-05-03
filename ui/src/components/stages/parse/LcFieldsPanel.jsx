import React, { useState } from 'react';
import { TabBar } from '../../ui/TabBar';
import { EyebrowLabel } from '../../ui/EyebrowLabel';
import { extractValue } from '../../../lib/fieldEnvelope';

/**
 * Read-only fields panel for the MT700/LC entry.
 *
 * Different from FieldsPanel for vision-extracted docs:
 *   - No Mark-reviewed bar (Mt700Parser is deterministic — no review needed)
 *   - No Compare tab (single-source parse, no per-slot comparison)
 *   - No correction popover (raw MT700 tags are authoritative)
 *
 * Tabs: Fields · Tags · Source
 */
export function LcFieldsPanel({ data, loading, width }) {
  const [tab, setTab] = useState('fields');
  const widthStyle = width ?? 'clamp(540px, 38vw, 720px)';

  if (loading) {
    return (
      <div className="bg-white overflow-auto flex flex-col h-full shrink-0 p-4 text-[12px] text-muted italic"
           style={{ width: widthStyle }}>
        Loading LC source…
      </div>
    );
  }

  const fields = data?.fields ?? {};
  const rawFields = data?.rawFields ?? {};
  const fieldKeys = Object.keys(fields);
  const tagKeys = Object.keys(rawFields);

  return (
    <div className="bg-white overflow-auto flex flex-col h-full shrink-0" style={{ width: widthStyle }}>
      <div className="px-4 py-2 border-b border-line bg-slate2 flex items-center gap-2 shrink-0">
        <span className="text-[10px] flex items-center gap-1 font-mono text-navy-1">
          <span className="px-1.5 py-0.5 rounded bg-navy-1 text-white text-[9px] font-bold">LC</span>
          MT700 source — read-only
        </span>
      </div>

      <div className="px-4 pt-3 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <EyebrowLabel>PARSED LC FIELDS</EyebrowLabel>
          <span className="text-[10px] text-muted font-mono">
            {fieldKeys.length} canonical · {tagKeys.length} raw tags
          </span>
        </div>
        <TabBar
          tabs={[
            { id: 'fields', label: 'Fields',   count: fieldKeys.length },
            { id: 'tags',   label: 'MT Tags',  count: tagKeys.length },
            { id: 'source', label: 'JSON' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'fields' && (
          fieldKeys.length === 0 ? (
            <div className="p-4 text-[11px] text-muted italic">
              MT700 not yet parsed (Parse stage hasn't run).
            </div>
          ) : (
            fieldKeys.map(k => (
              <div key={k} className="px-4 py-2 border-b border-line/50 flex items-start gap-3">
                <span className="text-[10px] tracking-wider uppercase text-muted font-mono w-44 shrink-0">{k}</span>
                <span className="text-[12px] text-navy-1 font-mono flex-1 break-words">
                  {formatValue(extractValue(fields[k]))}
                </span>
              </div>
            ))
          )
        )}
        {tab === 'tags' && (
          tagKeys.length === 0 ? (
            <div className="p-4 text-[11px] text-muted italic">No raw tags captured.</div>
          ) : (
            tagKeys.sort().map(k => (
              <div key={k} className="px-4 py-2 border-b border-line/50 flex items-start gap-3">
                <span className="text-[11px] text-teal-1 font-mono font-semibold w-14 shrink-0">{k}</span>
                <span className="text-[12px] text-navy-1 font-mono flex-1 break-words whitespace-pre-wrap">
                  {rawFields[k]}
                </span>
              </div>
            ))
          )
        )}
        {tab === 'source' && (
          <pre className="p-4 text-[11px] bg-slate2 font-mono overflow-auto">
            {JSON.stringify({ fields, rawFields, warnings: data?.warnings ?? [] }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function formatValue(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
