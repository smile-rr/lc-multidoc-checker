import { useEffect, useRef, useState } from 'react';
import { openStream } from '../api';

/**
 * Subscribe to the SSE stream for a session.
 * Returns:
 *   events            — all raw event objects in order
 *   stagesCompleted   — Set of completed stage names
 *   ruleResults       — Map<ruleId, {verdict, confidence}>
 *   sessionCompleted  — { compliant, discrepancies } or null
 *   officerActions    — DocTypeChanged / DocReviewed / FieldCorrected / ReconcileTriaged /
 *                       Locked / Unlocked / RuleOverridden / OverrideCleared / SignedOff
 *   signedOff         — { decision, officerId, ts } once SignedOff has fired
 *   cancelled         — { atStage, ts } once SessionCancelled has fired
 *   currentActivity   — latest extraction or rule-start event for the live ActivityStrip
 *   ruleProgress      — { ruleId, label, index, total, checkType } from latest RuleStarted
 *   stagesRerun       — count of StageRerun events seen (used to invalidate caches)
 */
export function useSse(sessionId) {
  const [events, setEvents] = useState([]);
  const [stagesCompleted, setStagesCompleted] = useState(new Set());
  const [ruleResults, setRuleResults] = useState(new Map());
  const [sessionCompleted, setSessionCompleted] = useState(null);
  const [officerActions, setOfficerActions] = useState([]);
  const [signedOff, setSignedOff] = useState(null);
  const [cancelled, setCancelled] = useState(null);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [ruleProgress, setRuleProgress] = useState(null);
  const [stagesRerun, setStagesRerun] = useState(0);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const seenSeqRef = useRef(-1);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const es = openStream(sessionId);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Drop duplicates from replay-after-reconnect; rely on monotonic seq.
        if (typeof msg.seq === 'number') {
          if (msg.seq <= seenSeqRef.current) return;
          seenSeqRef.current = msg.seq;
        }
        setEvents(prev => [...prev, msg]);

        switch (msg.type) {
          case 'StageStarted':
            setCurrentActivity({ kind: 'stage', text: `${msg.data.stageName} started`, ts: msg.ts });
            break;
          case 'StageCompleted':
            setStagesCompleted(prev => new Set([...prev, msg.data.stageName]));
            setCurrentActivity({ kind: 'stage', text: `${msg.data.stageName} complete`, ts: msg.ts });
            break;
          case 'StageRerun':
            // Reset downstream state derived from prior pipeline events
            setStagesRerun(c => c + 1);
            setStagesCompleted(prev => {
              const next = new Set(prev);
              const downstream = downstreamFrom(msg.data.fromStage);
              for (const s of downstream) next.delete(s);
              return next;
            });
            setRuleResults(new Map());
            setSessionCompleted(null);
            setSignedOff(null);
            setCancelled(null);
            setRuleProgress(null);
            setCurrentActivity({ kind: 'rerun', text: `↻ Re-running from ${msg.data.fromStage}`, ts: msg.ts });
            break;
          case 'RuleStarted':
            setRuleProgress({
              ruleId: msg.data.ruleId,
              label: msg.data.label,
              index: msg.data.index,
              total: msg.data.total,
              checkType: msg.data.checkType,
            });
            setCurrentActivity({
              kind: 'rule',
              text: `Rule ${msg.data.index}/${msg.data.total} · ${msg.data.ruleId}${msg.data.checkType ? ` (${msg.data.checkType})` : ''}`,
              ts: msg.ts,
            });
            break;
          case 'RuleChecked':
            setRuleResults(prev => {
              const next = new Map(prev);
              next.set(msg.data.ruleId, {
                verdict: msg.data.verdict,
                confidence: msg.data.confidence,
              });
              return next;
            });
            break;
          case 'ExtractionProgress':
            setCurrentActivity({
              kind: 'extract',
              text: `${msg.data.docType} · ${msg.data.slot} · ${msg.data.status}`,
              ts: msg.ts,
            });
            break;
          case 'SessionCompleted':
            setSessionCompleted({
              compliant: msg.data.compliant,
              discrepancies: msg.data.discrepancies,
            });
            setCurrentActivity({ kind: 'done', text: `Session complete — compliant=${msg.data.compliant}`, ts: msg.ts });
            break;
          case 'SessionCancelled':
            setCancelled({ atStage: msg.data.atStage, ts: msg.ts });
            setCurrentActivity({ kind: 'cancelled', text: `Cancelled at ${msg.data.atStage}`, ts: msg.ts });
            break;
          case 'DocTypeChanged':
          case 'DocReviewed':
          case 'FieldCorrected':
          case 'ReconcileTriaged':
          case 'Locked':
          case 'Unlocked':
          case 'RuleOverridden':
          case 'OverrideCleared':
            setOfficerActions(prev => [...prev, msg]);
            break;
          case 'SignedOff':
            setOfficerActions(prev => [...prev, msg]);
            setSignedOff({ decision: msg.data.decision, officerId: msg.data.officerId, ts: msg.ts });
            break;
          default:
            break;
        }
      } catch (_) {}
    };

      es.onerror = () => {
        // Reverse proxies / public-URL tunnels routinely drop idle SSE.
        // Close the half-open connection and reconnect after a short delay
        // — server replays the ring buffer on subscribe and seenSeqRef
        // de-dupes any events we already processed.
        setConnected(false);
        setError('Stream disconnected — reconnecting…');
        try { es.close(); } catch (_) {}
        if (cancelled) return;
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimerRef.current);
      const es = esRef.current;
      if (es) {
        try { es.close(); } catch (_) {}
      }
    };
  }, [sessionId]);

  return {
    events, stagesCompleted, ruleResults, sessionCompleted,
    officerActions, signedOff, cancelled, currentActivity, ruleProgress, stagesRerun,
    connected, error,
  };
}

const STAGE_ORDER = ['intake', 'parse', 'reconcile', 'examine', 'signoff'];
function downstreamFrom(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  if (i < 0) return [];
  return STAGE_ORDER.slice(i);
}
