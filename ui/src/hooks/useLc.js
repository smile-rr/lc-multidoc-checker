import { useEffect, useState, useCallback } from 'react';
import { getLc } from '../api';

/** Fetches LC source text + parsed fields for the Parse-stage MT700 view. */
export function useLc(sessionId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const next = await getLc(sessionId);
      // Keep last-known fields if a transient response arrives empty while
      // we already have populated data — avoids the "MT700 not yet parsed"
      // flash when the officer navigates back to Parse.
      setData(prev => {
        const prevHasFields = prev && prev.fields && Object.keys(prev.fields).length > 0;
        const nextHasFields = next && next.fields && Object.keys(next.fields).length > 0;
        if (prevHasFields && !nextHasFields) {
          return { ...next, fields: prev.fields, rawFields: prev.rawFields ?? {}, fieldLabels: prev.fieldLabels ?? {} };
        }
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
