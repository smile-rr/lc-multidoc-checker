import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../shared/Spinner';
import { RerunButton } from '../shared/RerunButton';
import { useDevMode } from '../../context/DevModeContext';
import { useRules } from '../../hooks/useRules';
import { useSignoff } from '../../hooks/useSignoff';
import { VerdictBand } from './signoff/VerdictBand';
import { DiscrepancyCard } from './signoff/DiscrepancyCard';
import { ReviewWorthyPasses } from './signoff/ReviewWorthyPasses';
import { OfficerNote } from './signoff/OfficerNote';
import { DecisionRadio } from './signoff/DecisionRadio';
import { Mt734Preview } from './signoff/Mt734Preview';
import { AuditTrailPanel } from './signoff/AuditTrailPanel';
import { SignedRecordView } from './signoff/SignedRecordView';

const OFFICER_ID = 'A. Wijaya';

/**
 * Stage 4 — Sign-off. 2-col layout, officer disposition + decision + sign-off gate.
 * Once signed, switches to SignedRecordView (immutable).
 */
export function SignoffPanel({ session, stagesCompleted, onBack }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const { rules } = useRules(sessionId);
  const { data: signoffData, sign, fetchMt734 } = useSignoff(sessionId);

  const failures = useMemo(() => rules.filter(r => (r.effectiveVerdict || r.verdict) === 'FAIL'), [rules]);
  const doubts   = useMemo(() => rules.filter(r => (r.effectiveVerdict || r.verdict) === 'DOUBTS'), [rules]);
  const lowConf  = useMemo(() => rules.filter(r =>
    (r.attention || []).some(t => ['LOW-CONF-PASS', 'SPLIT', 'HANDWRITING'].includes(t))
    && (r.effectiveVerdict || r.verdict) === 'PASS'), [rules]);
  const overrides = rules.filter(r => r.override).length;
  const flagged = rules.filter(r => r.override?.flagged).length;

  const [decision, setDecision] = useState(null);
  const [dispositions, setDispositions] = useState({});
  const [note, setNote] = useState('');
  const [showMt734, setShowMt734] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  useEffect(() => {
    setDispositions(prev => {
      const next = {};
      for (const f of failures) next[f.ruleId] = prev[f.ruleId] || 'PENDING';
      return next;
    });
  }, [failures.length]);

  useEffect(() => {
    if (decision === 'REFUSE' && advice == null && !loadingAdvice) {
      setLoadingAdvice(true);
      fetchMt734()
        .then(text => setAdvice(text))
        .catch(() => setAdvice('(failed to fetch MT734 advice)'))
        .finally(() => setLoadingAdvice(false));
    }
  }, [decision, advice, loadingAdvice, fetchMt734]);

  // Already signed → render the immutable record view
  if (signoffData?.signed) {
    return (
      <SignedRecordView
        session={session}
        record={signoffData.record}
        fetchMt734={fetchMt734}
        onBack={onBack}
      />
    );
  }

  const dispCount = failures.filter(f => (dispositions[f.ruleId] ?? 'PENDING') !== 'PENDING').length;
  const allDispositioned = failures.every(f => (dispositions[f.ruleId] ?? 'PENDING') !== 'PENDING');
  const canSign = decision != null
    && (decision === 'ACCEPT' || allDispositioned || devMode)
    && (note.trim().length > 0 || devMode);

  const setDisp = (id, d) => setDispositions(p => ({ ...p, [id]: d }));
  const clearDisp = (id) => setDispositions(p => ({ ...p, [id]: 'PENDING' }));
  const resetAll = () => {
    setDispositions(Object.fromEntries(failures.map(f => [f.ruleId, 'PENDING'])));
  };
  const autoDisposition = () => {
    setDispositions(Object.fromEntries(failures.map(f => [f.ruleId, 'WAIVER'])));
  };

  const handleSign = async () => {
    const dispToSend = {};
    for (const [k, v] of Object.entries(dispositions)) {
      if (v !== 'PENDING') dispToSend[k] = v;
    }
    await sign({
      decision,
      dispositions: dispToSend,
      note: note.trim() || (devMode ? '(dev-mode auto-note)' : ''),
      officerId: OFFICER_ID,
    });
  };

  const signoffDone = stagesCompleted?.has('signoff');

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 bg-white border-b border-line flex items-center gap-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">STAGE 4</div>
          <div className="text-[15px] font-semibold tracking-tight">Sign-off · officer decision</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!signoffDone && <Spinner size="sm" label="finalizing…" />}
          {onBack && (
            <button onClick={onBack} className="px-3 py-1.5 rounded-[8px] border border-line text-xs hover:bg-slate2">
              ← Back to Examine
            </button>
          )}
          <RerunButton sessionId={sessionId} stage="signoff" devMode={devMode} disabled={signoffData?.signed} />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate2">
        <div className="max-w-[1280px] mx-auto px-6 py-5 grid grid-cols-[1fr_360px] gap-5">

          <div className="space-y-5">
            <VerdictBand
              decision={decision}
              failures={failures.length}
              doubts={doubts.length}
              lowConfPasses={lowConf.length}
            />

            <div className="bg-white border border-line rounded-[10px]">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted font-mono">
                    DISCREPANCIES · {failures.length}
                  </div>
                  <div className="text-[13px] font-semibold tracking-tight">
                    Disposition each finding before signing off
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted font-mono">
                    {dispCount}/{failures.length} dispositioned
                  </span>
                  {dispCount > 0 && (
                    <button
                      onClick={resetAll}
                      className="text-[10px] px-2 py-1 rounded text-muted hover:bg-slate2 hover:text-navy-1 font-mono"
                    >
                      ↻ RESET ALL
                    </button>
                  )}
                  {devMode && failures.length > 0 && dispCount < failures.length && (
                    <button
                      onClick={autoDisposition}
                      className="text-[11px] px-3 py-1 rounded-[6px] bg-status-gold text-white hover:bg-status-gold/80"
                    >
                      ⚡ Auto-disposition all
                    </button>
                  )}
                </div>
              </div>
              {failures.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-muted">
                  No discrepancies — documents on their face appear to comply.
                </div>
              ) : (
                <div className="divide-y divide-line/50">
                  {failures.map(f => (
                    <DiscrepancyCard
                      key={f.ruleId}
                      rule={f}
                      disposition={dispositions[f.ruleId] ?? 'PENDING'}
                      onSet={setDisp}
                      onClear={clearDisp}
                    />
                  ))}
                </div>
              )}
            </div>

            <ReviewWorthyPasses rules={lowConf} />

            <OfficerNote value={note} onChange={setNote} />
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-line rounded-[10px] p-4">
              <DecisionRadio decision={decision} onChange={setDecision} />

              <button
                onClick={handleSign}
                disabled={!canSign}
                className={`w-full mt-4 py-2.5 rounded-[8px] text-[13px] font-semibold
                  ${canSign ? 'bg-navy-1 text-white hover:bg-navy-2' : 'bg-line text-muted cursor-not-allowed'}`}
              >
                🔒 Sign off &amp; freeze record
              </button>

              {!canSign && (
                <div className="text-[10px] text-status-gold mt-2 font-mono">
                  {!decision ? 'Select a decision'
                    : !allDispositioned && decision !== 'ACCEPT' ? 'Disposition all discrepancies'
                    : !note.trim() ? "Officer's note is required" : ''}
                </div>
              )}

              <div className="text-[10px] text-muted mt-2 font-mono">
                Sign-off stamps officer ID, timestamp, and the entire dataset (parsed values, rule
                outcomes, overrides, dispositions, note) into an immutable audit record.
              </div>
            </div>

            {decision === 'REFUSE' && (
              <Mt734Preview
                open={showMt734}
                onToggle={() => setShowMt734(o => !o)}
                advice={advice}
                loading={loadingAdvice}
              />
            )}

            <AuditTrailPanel
              session={session}
              totalRules={rules.length}
              overrides={overrides}
              agentFlags={flagged}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
