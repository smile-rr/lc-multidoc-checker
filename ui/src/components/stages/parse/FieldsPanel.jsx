import React, { useState } from 'react';
import { ConfChip } from '../../shared/ConfChip';
import { FieldRow } from './FieldRow';
import { CompareModeTable } from './CompareModeTable';
import { OffSchemaPanel } from './OffSchemaPanel';
import { docTypeMeta } from '../../../constants/docTypes';

/** Right-side fields panel with tabs. */
export function FieldsPanel({ doc, extracts, events, onCorrect, onMarkReviewed, devMode }) {
  const [tab, setTab] = useState('fields');
  const [compareMode, setCompareMode] = useState(false);

  if (!doc) return <div className="p-4 text-sm text-muted italic">Select a document.</div>;

  const fields = extracts?.fields ?? {};
  const slotResults = extracts?.slotResults ?? {};
  const offSchema = extracts?.offSchemaItems ?? [];
  const fieldKeys = Object.keys(fields);
  const t = docTypeMeta(doc.doc_type);
  const reviewed = doc.parse_status === 'REVIEWED';
  const failed = doc.parse_status === 'FAILED';
  const overallConf = extracts?.overallConfidence;

  // Pull failure detail from SSE events for this doc (status starts with "failed")
  const failureDetails = (events || []).filter(m =>
    m.type === 'ExtractionProgress'
    && m.data?.docType === doc.doc_type
    && typeof m.data?.status === 'string'
    && m.data.status.startsWith('failed')
  );

  return (
    <div className="bg-white overflow-auto flex flex-col h-full" style={{ width: 540 }}>
      {failed && (
        <div className="border-b border-status-red bg-status-redSoft px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="text-status-red text-[16px] leading-none">✕</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-status-red">
                Extraction failed for {t.name}
              </div>
              <div className="text-[11px] text-status-red/80 mt-0.5">
                {failureDetails.length === 0
                  ? 'No detail captured. Check service logs (/tmp/lc-checker-v2/svc.log) or re-run.'
                  : 'Latest slot failures (most recent last):'}
              </div>
              {failureDetails.length > 0 && (
                <ul className="mt-1.5 text-[10px] font-mono space-y-0.5 max-h-32 overflow-auto">
                  {failureDetails.slice(-5).map((m, i) => (
                    <li key={i} className="text-status-red/90">
                      <span className="text-status-red/70">[{(m.data.slot || '').padEnd(12, ' ')}] </span>
                      {String(m.data.status).replace(/^failed:?\s*/, '')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="px-4 pt-3 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">
            EXTRACTED · {t.name}
          </span>
          <button
            onClick={() => setCompareMode(c => !c)}
            className={`text-[10px] px-2 py-0.5 rounded border font-mono
              ${compareMode ? 'bg-navy-1 text-white border-navy-1' : 'border-line hover:bg-slate2'}`}
          >
            Compare extractors
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] mb-2 font-mono text-muted">
          <span>{fieldKeys.length} fields</span>
          {Object.keys(slotResults).length > 0 && (
            <span>{Object.keys(slotResults).length} slot{Object.keys(slotResults).length === 1 ? '' : 's'}</span>
          )}
          {overallConf != null && <span>· consensus conf {(overallConf * 100).toFixed(0)}%</span>}
        </div>
        <div className="flex border-b -mb-px overflow-x-auto">
          {[
            ['fields',    `Fields (${fieldKeys.length})`],
            ['offschema', `Off-schema · ✍ (${offSchema.length})`],
            ['raw',       'Raw'],
            ['json',      'JSON'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-[11px] tracking-tight border-b-2 whitespace-nowrap
                ${tab === id ? 'border-navy-1 text-navy-1 font-semibold' : 'border-transparent text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'fields' && (
          compareMode
            ? <CompareModeTable fields={fields} slotResults={slotResults} />
            : fieldKeys.length === 0
              ? <div className="p-4 text-[11px] text-muted italic">No extracted fields recorded for this document.</div>
              : fieldKeys.map(k => {
                  const fv = fields[k];
                  const v = extractValue(fv);
                  const conf = extractConf(fv);
                  const manual = !!(fv && typeof fv === 'object' && fv.manual);
                  const slotVals = {};
                  for (const s of Object.keys(slotResults)) {
                    slotVals[s] = extractValue(slotResults[s]?.[k]);
                  }
                  return (
                    <FieldRow
                      key={k}
                      label={k}
                      value={v}
                      conf={conf}
                      manual={manual}
                      slotValues={slotVals}
                      onCorrect={() => onCorrect({ key: k, value: v, slotValues: slotVals })}
                    />
                  );
                })
        )}
        {tab === 'offschema' && <OffSchemaPanel items={offSchema} />}
        {tab === 'raw' && (
          <div className="p-4">
            <pre className="text-[11px] bg-slate2 p-3 rounded whitespace-pre-wrap font-mono">
{`Off-schema items: ${offSchema.length}
Doc type:         ${doc.doc_type}
Filename:         ${doc.original_filename || doc.id}
Status:           ${doc.parse_status}`}
            </pre>
          </div>
        )}
        {tab === 'json' && (
          <pre className="p-4 text-[11px] bg-slate2 font-mono overflow-auto">
            {JSON.stringify({ fields, offSchemaItems: offSchema, slotResults }, null, 2)}
          </pre>
        )}
      </div>

      <div className="p-3 border-t border-line flex items-center gap-2 bg-white">
        {reviewed
          ? <span className="text-[10px] flex items-center gap-1.5 font-mono text-status-green">✓ Reviewed</span>
          : <span className="text-[10px] flex items-center gap-1.5 font-mono text-status-gold">⚠ Needs review</span>
        }
        <button
          onClick={onMarkReviewed}
          disabled={reviewed}
          className={`ml-auto px-3 py-1.5 rounded-[6px] text-[11px]
            ${reviewed ? 'bg-slate2 text-[#a1a1a6] cursor-not-allowed' : 'bg-teal-1 text-white hover:bg-teal-2'}`}
        >
          {reviewed ? 'Reviewed' : 'Mark reviewed →'}
        </button>
      </div>
    </div>
  );
}

function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

function extractConf(v) {
  if (v == null || typeof v !== 'object') return 'HIGH';
  const c = v.confidence;
  if (typeof c === 'string') return c.toUpperCase();
  if (typeof c === 'number') {
    if (c >= 0.95) return 'HIGH';
    if (c >= 0.75) return 'MED';
    return 'LOW';
  }
  return 'HIGH';
}
