/**
 * LC is available when an LC document row exists (legacy multi-PDF)
 * or segmentation has finished MT700 parse (deal bundle: lc.txt only).
 */
export function isLcReady(session, docs = []) {
  if ((docs ?? []).some(d => d.doc_type === 'LC')) return true;
  if (!session) return false;
  if (session.next_stage === 'parse' && session.awaiting_officer) return true;
  const raw = session.stage_completed_at;
  if (!raw) return false;
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Boolean(m?.segmentation);
  } catch {
    return false;
  }
}
