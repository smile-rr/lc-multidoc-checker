import React, { useState } from 'react';
import { FieldRow } from './FieldRow';
import { CompareModeTable } from './CompareModeTable';
import { OffSchemaPanel } from './OffSchemaPanel';
import { docTypeMeta } from '../../../constants/docTypes';
import { extractValue, extractConf } from '../../../lib/fieldEnvelope';
import { TabBar } from '../../ui/TabBar';
import { EyebrowLabel } from '../../ui/EyebrowLabel';
import { PrimaryButton } from '../../ui/Button';

/**
 * Right-side fields panel.
 * Tabs: Fields · Compare · Off-schema · Source (raw+json merged).
 * Mark-reviewed bar pinned at top so it sits in the same vertical zone as stage Continue.
 */
export function FieldsPanel({ doc, extracts, events, onCorrect, onMarkReviewed, width }) {
  const [tab, setTab] = useState('fields');

  if (!doc) return <div className="p-4 text-sm text-muted italic">Select a document.</div>;

  const fields = extracts?.fields ?? {};
  const slotResults = extracts?.slotResults ?? {};
  const offSchema = extracts?.offSchemaItems ?? [];
  const fieldKeys = Object.keys(fields);
  const t = docTypeMeta(doc.doc_type);
  const reviewed = doc.parse_status === 'REVIEWED';
  const failed = doc.parse_status === 'FAILED';
  const overallConf = extracts?.overallConfidence;
  const slotCount = Object.keys(slotResults).length;

  const failureDetails = (events || []).filter(m =>
    m.type === 'ExtractionProgress'
    && m.data?.docType === doc.doc_type
    && typeof m.data?.status === 'string'
    && m.data.status.startsWith('failed')
  );

  return (
    <div className="bg-white overflow-auto flex flex-col h-full shrink-0" style={{ width: width ?? 'clamp(540px, 38vw, 720px)' }}>
      {/* Sticky review bar — same vertical zone as the stage Continue button */}
      <div className="px-4 py-2 border-b border-line bg-slate2 flex items-center gap-2 shrink-0">
        {reviewed
          ? <span className="text-[10px] flex items-center gap-1 font-mono text-status-green">✓ Reviewed</span>
          : failed
            ? <span className="text-[10px] flex items-center gap-1 font-mono text-status-red">✕ Failed</span>
            : <span className="text-[10px] flex items-center gap-1 font-mono text-status-gold">⚠ Needs review</span>
        }
        <PrimaryButton
          tone="teal"
          size="sm"
          onClick={onMarkReviewed}
          disabled={reviewed}
          className="ml-auto"
        >
          {reviewed ? 'Reviewed' : 'Mark reviewed →'}
        </PrimaryButton>
      </div>

      {failed && (
        <div className="border-b border-status-red bg-status-redSoft px-4 py-3 shrink-0">
          <div className="flex items-start gap-2">
            <span className="text-status-red text-[16px] leading-none">✕</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-status-red">
                Extraction failed for {t.name}
              </div>
              <div className="text-[11px] text-status-red/80 mt-0.5">
                {failureDetails.length === 0
                  ? 'No detail captured. Check service logs or re-run.'
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

      <div className="px-4 pt-3 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <EyebrowLabel>EXTRACTED · {t.name} ({t.short})</EyebrowLabel>
          <span className="text-[10px] text-muted font-mono">
            {fieldKeys.length} fields
            {slotCount > 0 && ` · ${slotCount} slot${slotCount === 1 ? '' : 's'}`}
            {overallConf != null && ` · ${(overallConf * 100).toFixed(0)}% conf`}
          </span>
        </div>
        <TabBar
          tabs={[
            { id: 'fields',    label: 'Fields',     count: fieldKeys.length },
            { id: 'compare',   label: 'Compare',    count: slotCount > 1 ? slotCount : null },
            { id: 'offschema', label: 'Off-schema', count: offSchema.length },
            { id: 'source',    label: 'Source' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'fields' && (
          fieldKeys.length === 0
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
        {tab === 'compare' && <CompareModeTable fields={fields} slotResults={slotResults} />}
        {tab === 'offschema' && <OffSchemaPanel items={offSchema} />}
        {tab === 'source' && (
          <pre className="p-4 text-[11px] bg-slate2 font-mono overflow-auto">
            {JSON.stringify({ fields, offSchemaItems: offSchema, slotResults }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
