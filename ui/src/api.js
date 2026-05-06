const BASE = '/api/v2';

/**
 * Builds an Error that includes HTTP status + method + URL + body snippet,
 * and dispatches a window event so a global toast/banner can surface it
 * even when callers swallow the rejection. This is what makes silent
 * failures visible in the UI.
 */
async function apiError(res, method = 'GET') {
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  const url = res.url || '';
  const snippet = body ? body.slice(0, 300) : res.statusText || '';
  const msg = `${method} ${url} → ${res.status} ${snippet}`.trim();
  const err = new Error(msg);
  err.status = res.status;
  err.url = url;
  err.method = method;
  err.body = body;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('api-error', { detail: { status: res.status, url, method, body, message: msg } }));
  }
  return err;
}

// ── Sessions ───────────────────────────────────────────────────────────────
export async function createSession(lcText, files) {
  const form = new FormData();
  if (lcText) form.append('lcText', lcText);
  for (const f of files) form.append('files', f);
  const res = await fetch(`${BASE}/sessions`, { method: 'POST', body: form });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function listSessions(limit = 50) {
  const res = await fetch(`${BASE}/sessions?limit=${limit}`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/sessions/${id}`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getHealth() {
  const res = await fetch('/actuator/health');
  return res.ok;
}

export function openStream(sessionId) {
  return new EventSource(`${BASE}/sessions/${sessionId}/stream`);
}

// ── Documents ──────────────────────────────────────────────────────────────
export function pdfUrl(sessionId, docId) {
  return `${BASE}/sessions/${sessionId}/documents/${docId}/pdf`;
}

export async function getDocExtracts(sessionId, docId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/documents/${docId}/extracts`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function patchDocument(sessionId, docId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/documents/${docId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function correctField(sessionId, docId, fieldKey, body) {
  const res = await fetch(
    `${BASE}/sessions/${sessionId}/documents/${docId}/fields/${encodeURIComponent(fieldKey)}/correction`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── LC source + required-docs ─────────────────────────────────────────────
/** Returns { text, fields, rawFields, warnings } for the MT700 pane. */
export async function getLc(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/lc`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getLcRequiredDocs(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/lc/required-docs`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Reconcile ──────────────────────────────────────────────────────────────
export async function getReconcile(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/reconcile`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

/** Per-cell officer decision: parse_error | genuine | accept_match | edited */
export async function setCellDecision(sessionId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/reconcile/cell-decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function clearCellDecision(sessionId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/reconcile/cell-decision`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function triageReconcile(sessionId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/reconcile/triage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function lockSession(sessionId, officerId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/lock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function unlockSession(sessionId, officerId, reason) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/unlock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId, reason }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Rules + overrides ──────────────────────────────────────────────────────
export async function getRules(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/rules`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function overrideRule(sessionId, ruleId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/rules/${ruleId}/override`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function clearOverride(sessionId, ruleId, officerId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/rules/${ruleId}/override`, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ officerId }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Sign-off ───────────────────────────────────────────────────────────────
export async function getSignoff(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/signoff`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function postSignoff(sessionId, body) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/signoff`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getMt734(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/mt734`);
  if (!res.ok) throw await apiError(res);
  return res.text();
}

export async function getAudit(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/audit`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Presets (test/cases bundles) ──────────────────────────────────────────
export async function getPresets() {
  const res = await fetch(`${BASE}/presets`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

/** Returns a Blob; caller wraps in File() with the right name + MIME. */
export async function getPresetFile(presetId, filename) {
  const res = await fetch(`${BASE}/presets/${encodeURIComponent(presetId)}/files/${encodeURIComponent(filename)}`);
  if (!res.ok) throw await apiError(res);
  return res.blob();
}

// ── Article refs (UCP/ISBP tooltips) ──────────────────────────────────────
export async function getArticleRef(id) {
  const res = await fetch(`${BASE}/refs/${id}`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Session events (history) ─────────────────────────────────────────────────
/** Fetch all persisted events for a session (for history popover). */
export async function getSessionEvents(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/events`);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// ── Pipeline control: officer-triggered stage advance + re-run ────────────
/** Advance the pipeline forward to {stage}. Stage must match session.next_stage. */
export async function runStage(sessionId, stage, officerId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/stages/${stage}/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

/** Re-run from a prior stage (back-to-edit flow). Wipes downstream state. */
export async function rerunStage(sessionId, stage, officerId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/stages/${stage}/rerun`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}
