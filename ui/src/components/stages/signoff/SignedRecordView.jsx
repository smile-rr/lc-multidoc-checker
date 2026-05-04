import React, { useMemo, useState } from 'react';
import { Mt734Preview } from './Mt734Preview';
import { VerdictBand } from './VerdictBand';
import { DiscrepancyCard } from './DiscrepancyCard';
import { ReviewWorthyPasses } from './ReviewWorthyPasses';
import { OfficerNote } from './OfficerNote';
import { DecisionRadio } from './DecisionRadio';
import { AuditTrailPanel } from './AuditTrailPanel';
import { StagePage, StageBody } from '../../ui/StagePage';
import { StageToolbar } from '../../ui/StageToolbar';
import { PageContainer } from '../../ui/PageContainer';
import { Card } from '../../ui/Card';
import { EyebrowLabel } from '../../ui/EyebrowLabel';

const TONE = {
  ACCEPT:  { c: '#1a7a43', bg: '#f0fdf4', label: 'DOCUMENTS COMPLIANT', icon: '✓' },
  WAIVER:  { c: '#0066cc', bg: '#eff6ff', label: 'DISCREPANT · WAIVER PENDING', icon: '?' },
  REFUSE:  { c: '#cc0011', bg: '#fff1f0', label: 'DOCUMENTS REFUSED', icon: '✕' },
};

/**
 * Read-only sign-off view shown after the record is frozen. Renders the same
 * 2-column layout the officer used to sign — discrepancies + dispositions,
 * officer note, decision, audit trail — all sealed and uneditable, with the
 * immutable stamp banner on top and an Export JSON / MT734 actions row.
 */
export function SignedRecordView({
  session, record, rules = [], failures = [], doubts = [], lowConf = [],
  overrides = 0, flagged = 0, fetchMt734, onBack,
}) {
  const decision = record?.decision || 'ACCEPT';
  const tone = TONE[decision] || TONE.ACCEPT;
  const officer = record?.officer_id || '—';
  const signedAt = record?.signed_at ? formatTs(record.signed_at) : '';
  const note = record?.officer_note || '';

  // Dispositions are persisted as a JSON string on the record. Parse once.
  const dispositions = useMemo(() => {
    const raw = record?.discrepancy_dispositions;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  }, [record?.discrepancy_dispositions]);

  const [showMt734, setShowMt734] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const onMt734Toggle = async () => {
    setShowMt734(o => !o);
    if (!showMt734 && advice == null && fetchMt734) {
      setLoadingAdvice(true);
      try { setAdvice(await fetchMt734()); }
      catch { setAdvice('(failed to fetch)'); }
      finally { setLoadingAdvice(false); }
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ session, record }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lc-v2-record-${(session?.id ?? 'export').slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <StagePage>
      <StageToolbar
        title="Sign-off"
        meta={
          <span className="text-[11px] text-muted font-mono flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] tracking-wider"
                  style={{ background: tone.bg, color: tone.c }}>
              <span>🔒</span>
              <span>SIGNED · IMMUTABLE</span>
            </span>
            {officer} · {signedAt}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportJson}
              className="px-3 py-1.5 rounded text-[12px] border border-line bg-white hover:bg-slate2"
            >
              ⤓ Export JSON
            </button>
            {decision === 'REFUSE' && (
              <button
                onClick={onMt734Toggle}
                className="px-3 py-1.5 rounded text-[12px] border border-status-red text-status-red bg-white hover:bg-status-redSoft"
              >
                {showMt734 ? 'Hide' : 'View'} MT734 advice
              </button>
            )}
            {onBack && (
              <button
                onClick={onBack}
                className="px-3 py-1.5 rounded text-[12px] text-muted hover:bg-slate2"
              >
                ↩ back to Examine
              </button>
            )}
          </div>
        }
      />

      <StageBody tone="slate">
        <PageContainer className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

          <div className="space-y-5">
            <VerdictBand
              decision={decision}
              failures={failures.length}
              doubts={doubts.length}
              lowConfPasses={lowConf.length}
            />

            <Card padding="">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <EyebrowLabel>DISCREPANCIES · {failures.length}</EyebrowLabel>
                  <div className="text-[13px] font-semibold tracking-tight">
                    Findings as recorded at sign-off
                  </div>
                </div>
                <div className="text-[11px] text-muted font-mono">
                  {Object.keys(dispositions).length}/{failures.length} dispositioned
                </div>
              </div>
              {failures.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-muted">
                  No discrepancies — documents on their face appeared to comply.
                </div>
              ) : (
                <div className="divide-y divide-line/50">
                  {failures.map(f => (
                    <DiscrepancyCard
                      key={f.ruleId}
                      rule={f}
                      disposition={dispositions[f.ruleId] ?? 'PENDING'}
                      readOnly
                    />
                  ))}
                </div>
              )}
            </Card>

            <ReviewWorthyPasses rules={lowConf} />

            <OfficerNote value={note} readOnly />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card>
              <DecisionRadio decision={decision} readOnly />
            </Card>

            {decision === 'REFUSE' && showMt734 && (
              <Mt734Preview open={true} onToggle={onMt734Toggle} advice={advice} loading={loadingAdvice} />
            )}

            <AuditTrailPanel
              session={session}
              totalRules={rules.length}
              overrides={overrides}
              agentFlags={flagged}
            />
          </div>

        </PageContainer>
      </StageBody>
    </StagePage>
  );
}

function formatTs(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch { return String(s); }
}
