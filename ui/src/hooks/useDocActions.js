import { useCallback } from 'react';
import { patchDocument, correctField } from '../api';

export function useDocActions(sessionId) {
  const setType = useCallback((docId, docType, officerId) =>
    patchDocument(sessionId, docId, { docType, confirmedByOfficer: true, officerId }),
    [sessionId]);

  const markReviewed = useCallback((docId, officerId) =>
    patchDocument(sessionId, docId, { parseStatus: 'REVIEWED', officerId }),
    [sessionId]);

  const confirm = useCallback((docId, officerId) =>
    patchDocument(sessionId, docId, { confirmedByOfficer: true, officerId }),
    [sessionId]);

  const correct = useCallback((docId, fieldKey, body) =>
    correctField(sessionId, docId, fieldKey, body),
    [sessionId]);

  return { setType, markReviewed, confirm, correct };
}
