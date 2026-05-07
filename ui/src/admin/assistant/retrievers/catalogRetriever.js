import { getState } from '../../store';

const score = (text, q) => {
  if (!q) return 0;
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const t = (text || '').toLowerCase();
  let s = 0;
  for (const tok of tokens) if (t.includes(tok)) s += 1;
  return s;
};

export const findRule = (idOrLabel) => {
  const s = getState();
  const exact = s.rules.find((r) => r.rule_id.toLowerCase() === idOrLabel.toLowerCase());
  if (exact) return exact;
  const ranked = s.rules
    .map((r) => ({ r, s: score(`${r.rule_id} ${r.name}`, idOrLabel) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.r || null;
};

export const rulesCiting = (refId) => {
  const s = getState();
  return s.rules.filter((r) =>
    (r.ucp_refs || []).includes(refId) || (r.isbp_refs || []).includes(refId));
};

export const rulesByDoc = (docType) => {
  const s = getState();
  return s.rules.filter((r) => (r.applies_to || []).includes(docType));
};

export const findPrompt = (idOrLabel) => {
  const s = getState();
  return s.prompts.find((p) => p.id.toLowerCase().endsWith(idOrLabel.toLowerCase()))
    || s.prompts.find((p) => p.boundRuleId && p.boundRuleId.toLowerCase() === idOrLabel.toLowerCase())
    || null;
};

export const findField = (key) => {
  const s = getState();
  return s.fields.find((f) => f.key.toLowerCase() === key.toLowerCase()) || null;
};

export const allRules = () => getState().rules;
