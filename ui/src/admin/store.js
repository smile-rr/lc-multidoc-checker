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

export const STATES = ['DRAFT', 'IN_REVIEW', 'SHADOW', 'STAGED', 'PUBLISHED'];

export const transitionRule = (ruleId, to, actor, note) => {
  const r = state.rules.find((x) => x.rule_id === ruleId);
  if (!r) return;
  state.lifecycleEvents.unshift({
    id: 'e' + Date.now(), artifact: 'rule', artifactId: ruleId,
    from: r.state, to, actor, at: new Date().toISOString(), note,
  });
  r.state = to;
  if (to === 'PUBLISHED') r.publishedVersion = r.workingVersion;
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
  if (p.state === 'PUBLISHED') {
    state.lifecycleEvents.unshift({
      id: 'e' + Date.now(), artifact: 'prompt', artifactId: promptId,
      from: 'PUBLISHED', to: 'DRAFT', actor, at: new Date().toISOString(),
      note: 'Edited body — auto-forked to draft.',
    });
    p.state = 'DRAFT';
  }
  p.body = body;
  p.lastEditedAt = new Date().toISOString();
  p.lastEditedBy = actor;
  emit();
};

export const updateRuleField = (ruleId, field, value, actor) => {
  const r = state.rules.find((x) => x.rule_id === ruleId);
  if (!r) return;
  if (r.state === 'PUBLISHED') {
    state.lifecycleEvents.unshift({
      id: 'e' + Date.now(), artifact: 'rule', artifactId: ruleId,
      from: 'PUBLISHED', to: 'DRAFT', actor, at: new Date().toISOString(),
      note: `Edited ${field} — auto-forked to draft.`,
    });
    r.state = 'DRAFT';
  }
  r[field] = value;
  r.lastEditedAt = new Date().toISOString();
  r.lastEditedBy = actor;
  emit();
};
