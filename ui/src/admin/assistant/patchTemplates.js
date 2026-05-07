import { createRule, updateRuleField, transitionRule, updatePromptBody } from '../store';

const severityFor = (text) => {
  const t = (text || '').toLowerCase();
  if (/\bmust\b|prohibit|never|critical/.test(t)) return 'CRITICAL';
  if (/\bshould\b|major|require/.test(t)) return 'MAJOR';
  return 'MAJOR';
};

const tierFor = (text) => {
  const t = (text || '').toLowerCase();
  if (/\b(amount|date|currency|quantity|equal|exceed|tolerance|percent|number)\b/.test(t)) return 'PROGRAMMATIC';
  if (/\b(describe|description|wording|spelling|typograph|equivalent|consist|materially)\b/.test(t)) return 'AGENT';
  return 'AGENT';
};

export const makeRuleCreatePatch = ({ ruleId, name, citation, rationale, sources = [], applies_to = ['INV'], category = 'EXAM' }) => {
  const refText = citation?.text || '';
  const isbpRef = citation && citation.source === 'ISBP821' ? citation.id : null;
  const ucpRef = citation && citation.source === 'UCP600' ? citation.id : null;
  const severity = severityFor(refText + ' ' + name);
  const tier = tierFor(refText + ' ' + name);
  const promptInstruction = `Determine whether the document satisfies ${citation?.id || 'the cited authority'} (${citation?.heading || name}). Cite the paragraph in your explanation.`;
  return {
    id: 'p_' + ruleId + '_' + Date.now(),
    kind: 'rule.create',
    target: ruleId,
    title: name,
    meta: { severity, tier, applies_to },
    diff: [
      ['+', `rule_id: ${ruleId}`],
      ['+', `name: ${name}`],
      ['+', `category: ${category}`],
      ['+', `severity: ${severity}`],
      ['+', `applies_to: [${applies_to.join(', ')}]`],
      ['+', `check_type: ${tier}`],
      ucpRef && ['+', `ucp_refs: [${ucpRef}]`],
      isbpRef && ['+', `isbp_refs: [${isbpRef}]`],
      tier === 'AGENT' && ['+', `prompt_instruction: |`],
      tier === 'AGENT' && [' ', '    ' + promptInstruction],
    ].filter(Boolean),
    rationale,
    citations: [citation?.id].filter(Boolean),
    sources,
    apply: (actor) => createRule({
      rule_id: ruleId,
      name,
      category,
      severity,
      applies_to,
      check_type: tier,
      ucp_refs: ucpRef ? [ucpRef] : [],
      isbp_refs: isbpRef ? [isbpRef] : [],
      prompt_path: tier === 'AGENT' ? `prompts/check/${ruleId}.tokenized.st` : null,
      expression: null,
    }, actor),
  };
};

export const makeRuleUpdatePatch = ({ rule, field, before, after, rationale, citations = [] }) => ({
  id: 'p_' + rule.rule_id + '_' + field + '_' + Date.now(),
  kind: 'rule.update',
  target: rule.rule_id,
  title: rule.name,
  meta: { field },
  diff: [
    ['-', `${field}: ${JSON.stringify(before)}`],
    ['+', `${field}: ${JSON.stringify(after)}`],
  ],
  rationale,
  citations,
  apply: (actor) => { updateRuleField(rule.rule_id, field, after, actor); return true; },
});

export const makePromptUpdatePatch = ({ prompt, after, rationale, citations = [] }) => ({
  id: 'p_' + prompt.id.replace(/\W/g, '_') + '_' + Date.now(),
  kind: 'prompt.update',
  target: prompt.id,
  title: prompt.filename || prompt.id,
  meta: { kind: prompt.kind },
  diff: [
    ['-', '(prior body)'],
    ['+', after.split('\n').slice(0, 8).join('\n') + (after.split('\n').length > 8 ? '\n...' : '')],
  ],
  rationale,
  citations,
  apply: (actor) => { updatePromptBody(prompt.id, after, actor); return true; },
});

export { transitionRule };
