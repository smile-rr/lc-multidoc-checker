// In-memory store for the static governance prototype.
// No backend; mutations live only for the session.
import { useEffect, useReducer } from 'react';
import seed from './mockData.json';

const state = structuredClone(seed);
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getState = () => state;

// Plain pub-sub hook — re-renders subscribers on any mutation.
// Selectors are evaluated on each render (not cached), so `.filter()` /
// `.find()` are safe here (unlike useSyncExternalStore which requires
// snapshot stability).
export const useStore = (selector) => {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribe(force), []);
  return selector(state);
};

export const STATES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RELEASED'];

export const transitionRule = (ruleId, to, actor, note) => {
  const r = state.rules.find((x) => x.rule_id === ruleId);
  if (!r) return;
  state.lifecycleEvents.unshift({
    id: 'e' + Date.now(), artifact: 'rule', artifactId: ruleId,
    from: r.state, to, actor, at: new Date().toISOString(), note,
  });
  r.state = to;
  if (to === 'RELEASED') r.publishedVersion = r.workingVersion;
  emit();
};

export const transitionPrompt = (promptId, to, actor, note) => {
  const p = state.prompts.find((x) => x.id === promptId);
  if (!p) return;
  state.lifecycleEvents.unshift({
    id: 'e' + Date.now(), artifact: 'prompt', artifactId: promptId,
    from: p.state, to, actor, at: new Date().toISOString(), note,
  });
  p.state = to;
  emit();
};

export const updatePromptBody = (promptId, body, actor) => {
  const p = state.prompts.find((x) => x.id === promptId);
  if (!p) return;
  if (p.state === 'RELEASED') {
    state.lifecycleEvents.unshift({
      id: 'e' + Date.now(), artifact: 'prompt', artifactId: promptId,
      from: 'RELEASED', to: 'DRAFT', actor, at: new Date().toISOString(),
      note: 'Edited body — auto-forked to draft.',
    });
    p.state = 'DRAFT';
  }
  p.body = body;
  p.lastEditedAt = new Date().toISOString();
  p.lastEditedBy = actor;
  emit();
};

const ruleSkeleton = (rule_id, name, overrides = {}) => ({
  rule_id, name,
  category: 'EXAM', enabled: false, version: 1,
  severity: 'MAJOR', polarity: 'POSITIVE', waivable: true,
  applies_to: [], triggers: { any_of: [] }, lc_fields_required: [], field_keys: [],
  ucp_refs: [], isbp_refs: [],
  check_type: 'AGENT', prompt_path: null, expression: null,
  output_schema: '{"verdict":"PASS|FAIL|DOUBTS","explanation":"<one sentence>"}',
  health_signals: { eval_pass_rate: null, override_rate: null, doubts_rate: null, p95_latency_ms: null, cost_usd_per_check: null },
  policy_overlays: {}, eval_cases: [],
  state: 'DRAFT', publishedVersion: null, workingVersion: 1,
  draftAuthor: null, boundPromptId: null, boundPromptState: null,
  lastEditedAt: new Date().toISOString(), lastEditedBy: null,
  ...overrides,
});

export const createRule = (rule, actor) => {
  if (state.rules.find((x) => x.rule_id === rule.rule_id)) return false;
  const r = ruleSkeleton(rule.rule_id, rule.name, { ...rule, draftAuthor: actor, lastEditedBy: actor });
  state.rules.unshift(r);
  state.lifecycleEvents.unshift({
    id: 'e' + Date.now(), artifact: 'rule', artifactId: r.rule_id,
    from: null, to: 'DRAFT', actor, at: new Date().toISOString(),
    note: 'Drafted via Governance Assistant.',
  });
  emit();
  return true;
};

export const updateRuleField = (ruleId, field, value, actor) => {
  const r = state.rules.find((x) => x.rule_id === ruleId);
  if (!r) return;
  if (r.state === 'RELEASED') {
    state.lifecycleEvents.unshift({
      id: 'e' + Date.now(), artifact: 'rule', artifactId: ruleId,
      from: 'RELEASED', to: 'DRAFT', actor, at: new Date().toISOString(),
      note: `Edited ${field} — auto-forked to draft.`,
    });
    r.state = 'DRAFT';
  }
  r[field] = value;
  r.lastEditedAt = new Date().toISOString();
  r.lastEditedBy = actor;
  emit();
};
