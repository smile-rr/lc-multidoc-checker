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
import { OFFICER_ID } from '../../lib/officer';
import { compareDocType } from '../../constants/docTypes';
import { StagePage, StageBody } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { StageNavButtons } from '../ui/StageNavButtons';
import { PageContainer } from '../ui/PageContainer';
import { Card } from '../ui/Card';
import { EyebrowLabel } from '../ui/EyebrowLabel';
import { PrimaryButton, GhostButton, DevShortcutButton } from '../ui/Button';

/**
 * Stage 4 — Sign-off. 2-col layout, officer disposition + decision + sign-off gate.
 * CTA "Sign off & freeze record" sits at the bottom of the left column — natural
 * conclusion of the disposition flow. Right column is read-only context.
 * Once signed, switches to SignedRecordView (immutable).
 */
export function SignoffPanel({ session, stagesCompleted, onBack }) {
  const { enabled: devMode } = useDevMode();
  const sessionId = session?.id;

  const { rules } = useRules(sessionId);
  const { data: signoffData, sign, fetchMt734 } = useSignoff(sessionId);

  // Sort findings by review priority — INV failures before BOL, etc.
  // Severity stays a secondary sort within the same doc-type bucket.
  const sevRank = { CRITICAL: 0, MAJOR: 1, MINOR: 2, OBSERVATION: 3 };
  const sortByDocThenSev = (rs) => [...rs].sort((a, b) => {
    const da = (a.scope || [])[0] || 'UNKNOWN';
    const db = (b.scope || [])[0] || 'UNKNOWN';
    const c = compareDocType(da, db);
    if (c !== 0) return c;
    return (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
  });

  const failures = useMemo(() => sortByDocThenSev(
    rules.filter(r => (r.effectiveVerdict || r.verdict) === 'FAIL')
  ), [rules]);
  const doubts   = useMemo(() => sortByDocThenSev(
    rules.filter(r => (r.effectiveVerdict || r.verdict) === 'DOUBTS')
  ), [rules]);
  const lowConf  = useMemo(() => sortByDocThenSev(
    rules.filter(r =>
      (r.attention || []).some(t => ['LOW-CONF-PASS', 'SPLIT', 'HANDWRITING'].includes(t))
      && (r.effectiveVerdict || r.verdict) === 'PASS')
  ), [rules]);
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
  const blockerText = !decision ? 'Select a decision'
    : !allDispositioned && decision !== 'ACCEPT' ? 'Disposition all discrepancies'
    : !note.trim() ? "Officer's note is required" : '';

  return (
    <StagePage>
      <StageToolbar
        title="Sign-off"
        meta={
          <span className="text-[11px] text-muted font-mono flex items-center gap-2">
            officer decision
            {!signoffDone && <Spinner size="sm" />}
          </span>
        }
        actions={
          <>
            <RerunButton sessionId={sessionId} stage="signoff" devMode={devMode} disabled={signoffData?.signed} />
            <StageNavButtons stage="signoff" onBack={onBack} />
          </>
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
                    Disposition each finding before signing off
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted font-mono">
                    {dispCount}/{failures.length} dispositioned
                  </span>
                  {dispCount > 0 && (
                    <GhostButton onClick={resetAll}>↻ reset all</GhostButton>
                  )}
                  {devMode && failures.length > 0 && dispCount < failures.length && (
                    <DevShortcutButton onClick={autoDisposition}>⚡ Auto-disposition all</DevShortcutButton>
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
            </Card>

            <ReviewWorthyPasses rules={lowConf} />

            <OfficerNote value={note} onChange={setNote} />

            {/* Primary CTA — bottom of the disposition flow */}
            <Card>
              <PrimaryButton
                size="lg"
                onClick={handleSign}
                disabled={!canSign}
                className="w-full justify-center"
              >
                🔒 Sign off &amp; freeze record
              </PrimaryButton>
              {!canSign && blockerText && (
                <div className="text-[10px] text-status-gold mt-2 font-mono text-center">
                  {blockerText}
                </div>
              )}
              <div className="text-[10px] text-muted mt-2 font-mono">
                Sign-off stamps officer ID, timestamp, and the entire dataset (parsed values, rule
                outcomes, overrides, dispositions, note) into an immutable audit record.
              </div>
            </Card>
          </div>

          {/* Right column: read-only context */}
          <div className="space-y-4">
            <Card>
              <DecisionRadio decision={decision} onChange={setDecision} />
            </Card>

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

        </PageContainer>
      </StageBody>
    </StagePage>
  );
}
