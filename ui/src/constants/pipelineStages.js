/**
 * UI + backend pipeline stage model.
 * Reconcile is omitted from the officer-facing flow (backend skips orchestration).
 */

export const UI_PIPELINE_STAGES = [
  { key: 'upload',           label: 'Upload',           icon: '⓪', backendKey: null },
  { key: 'segmentation',     label: 'Segmentation',     icon: '①', backendKey: 'segmentation' },
  { key: 'parse',            label: 'Parse',            icon: '②', backendKey: 'parse' },
  { key: 'compliance-check', label: 'Compliance Check', icon: '③', backendKey: 'compliance-check' },
  { key: 'signoff',          label: 'Sign-off',         icon: '④', backendKey: 'signoff' },
];

/** Backend stages the officer can advance through (reconcile excluded). */
export const BACKEND_STAGE_ORDER = UI_PIPELINE_STAGES
  .filter(s => s.backendKey)
  .map(s => s.backendKey);

export const STAGE_LABELS = Object.fromEntries(
  UI_PIPELINE_STAGES.map(s => [s.key, s.label]),
);

export function stageLabel(key) {
  return STAGE_LABELS[key] ?? key;
}

export function nextBackendStage(current) {
  const i = BACKEND_STAGE_ORDER.indexOf(current);
  return i >= 0 && i < BACKEND_STAGE_ORDER.length - 1 ? BACKEND_STAGE_ORDER[i + 1] : null;
}

export function prevBackendStage(current) {
  const i = BACKEND_STAGE_ORDER.indexOf(current);
  return i > 0 ? BACKEND_STAGE_ORDER[i - 1] : null;
}

/** Map session.status (SEGMENTATION, COMPLIANCE_CHECK, …) to UI/backend stage key. */
export function stageKeyFromStatus(status) {
  const raw = String(status || '').toLowerCase().replace(/_/g, '-');
  if (BACKEND_STAGE_ORDER.includes(raw)) return raw;
  if (raw === 'awaiting-officer' || raw === 'queued' || raw === 'completed' || raw === 'failed') {
    return null;
  }
  return null;
}

export function landingStageForNext(nextStage) {
  const raw = String(nextStage || '').toLowerCase();
  const nextIdx = BACKEND_STAGE_ORDER.indexOf(raw);
  if (nextIdx > 0) return BACKEND_STAGE_ORDER[nextIdx - 1];
  if (nextIdx === 0) return BACKEND_STAGE_ORDER[0];
  return 'segmentation';
}
