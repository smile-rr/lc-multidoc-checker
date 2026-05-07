import * as ucpisbp from './retrievers/ucpIsbpRetriever';
import * as hist from './retrievers/historyRetriever';
import * as cat from './retrievers/catalogRetriever';
import { makeRuleCreatePatch, makeRuleUpdatePatch } from './patchTemplates';

// Intent classification ------------------------------------------------------
const RX = {
  draftRule:   /(draft|create|propose|new|add)\s+(a\s+)?rule/i,
  fromRef:     /(from|for|cit\w+|based on)\s+(ucp|isbp)[\s-]?[\w-]+/i,
  searchRef:   /^(what does|read|show|quote|cite)\s+(ucp|isbp)/i,
  refInline:   /\b(ucp[-\s]?\d+[a-z]?(?:[-\s]?[a-z])?|isbp[-\s]?[a-z]?\d+)\b/i,
  override:    /(override|overridden|overrid)/i,
  failMost:    /(fail|failure)s?\s+(most|often|the most)/i,
  agentRules:  /(agent\s+rule|agent-?driven)/i,
  missing:     /(what.?s|whats|what is)\s+missing\s+for\s+([a-z]{2,4})/i,
  improve:     /(improv|missing|gap|coverage|review.*catalog)/i,
  explainRule: /^(explain|why does|what does)\s+([A-Z]+-\d+)/,
  session:     /session\s+#?(\d+)/i,
};

const pickRefId = (text) => {
  const m = text.match(/\b(ucp[-\s]?\d+[a-z]?(?:[-\s]?[a-z])?|isbp[-\s]?[a-z]?\d+)\b/i);
  if (!m) return null;
  return m[0].toUpperCase().replace(/\s+/g, '-').replace(/^UCP-?/, 'UCP-').replace(/^ISBP-?/, 'ISBP-');
};

const classify = (text) => {
  if (RX.explainRule.test(text)) return 'explain_rule';
  if (RX.draftRule.test(text) || (RX.fromRef.test(text) && RX.refInline.test(text))) return 'draft_rule';
  if (RX.searchRef.test(text)) return 'search_ref';
  if (RX.missing.test(text)) return 'improve';
  if (RX.improve.test(text)) return 'improve';
  if (RX.override.test(text) || RX.failMost.test(text) || RX.agentRules.test(text)) return 'history';
  if (RX.session.test(text)) return 'history';
  if (RX.refInline.test(text)) return 'search_ref';
  return 'smalltalk';
};

// Reply builders -------------------------------------------------------------
const para = (...lines) => lines.join(' ');

const nextRuleId = (prefix) => {
  const existing = cat.allRules().filter((r) => r.rule_id.startsWith(prefix + '-')).map((r) => +r.rule_id.split('-')[1]).filter((n) => !isNaN(n));
  const max = existing.length ? Math.max(...existing) : 0;
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
};

const replyDraftRule = (text) => {
  const refId = pickRefId(text);
  let citation = refId ? ucpisbp.lookupRef(refId) : null;
  if (!citation) {
    const hits = ucpisbp.search(text, 1);
    citation = hits[0] ? ucpisbp.lookupRef(hits[0].id) : null;
  }
  if (!citation) {
    return {
      paragraphs: [
        para(`I couldn't anchor a UCP/ISBP paragraph to that request — every rule needs to cite one. Try referencing an article (e.g. "draft a rule from UCP 14(h)" or "from ISBP A19").`),
      ],
      citations: [],
      patches: [],
      contextArtifacts: [],
      reasoning: ['parsing intent', 'searching corpus', 'no citation anchor'],
    };
  }
  const existingCiters = cat.rulesCiting(citation.id);
  const docHint = /\b(invoice|inv\b)/i.test(citation.text + ' ' + text) ? 'INV'
    : /\bbill of lading|\bbol\b/i.test(citation.text + ' ' + text) ? 'BOL'
    : /\bpacking\b/i.test(citation.text + ' ' + text) ? 'PKL'
    : 'INV';
  const prefix = docHint === 'INV' ? 'GOODS' : docHint;
  const ruleId = nextRuleId(prefix === 'INV' ? 'GOODS' : (prefix === 'BOL' ? 'TRANS' : 'EXAM'));
  const sessionsCiting = hist.sessionsCitingReason(citation.id.replace(/^.*-/, '')).slice(0, 3);
  const ruleName = (citation.heading || 'New rule').replace(/^.*?—\s*/, '');

  const patch = makeRuleCreatePatch({
    ruleId,
    name: ruleName.length > 70 ? ruleName.slice(0, 70) + '…' : ruleName,
    citation,
    rationale: existingCiters.length === 0
      ? `No rule currently cites ${citation.id}.`
      : `${existingCiters.length} rule(s) already cite ${citation.id}; this proposal narrows scope.`,
    sources: sessionsCiting,
    applies_to: [docHint],
  });

  const paragraphs = [
    `${citation.id} (${citation.heading}) reads: "${citation.text.slice(0, 220)}${citation.text.length > 220 ? '…' : ''}"`,
    existingCiters.length === 0
      ? `The catalogue has no rule citing ${citation.id} yet${sessionsCiting.length ? `, and ${sessionsCiting.length} recent session(s) (${sessionsCiting.map((s) => '#' + s).join(', ')}) show officer overrides referencing this paragraph` : ''}. Drafting ${ruleId} as ${patch.meta.tier}, severity ${patch.meta.severity}, triggered on ${docHint}.`
      : `${existingCiters.length} rule(s) already cite ${citation.id} — proposing ${ruleId} as a sibling that narrows scope to ${docHint}.`,
    `See the patch slip on the right; applying it lands a DRAFT in the Rules tab.`,
  ];
  return {
    paragraphs,
    citations: [citation],
    patches: [patch],
    contextArtifacts: [{ kind: 'rule.preview', payload: { rule_id: ruleId, name: patch.title, ...patch.meta, ucp_refs: citation.source === 'UCP600' ? [citation.id] : [], isbp_refs: citation.source === 'ISBP821' ? [citation.id] : [] } }],
    reasoning: [`reading ${citation.id}`, 'scanning catalogue for prior citers', 'drafting patch'],
  };
};

const replySearchRef = (text) => {
  const refId = pickRefId(text);
  let hits = [];
  if (refId) {
    const exact = ucpisbp.lookupRef(refId);
    if (exact) hits = [exact];
  }
  if (!hits.length) hits = ucpisbp.search(text, 3);
  if (!hits.length) {
    return {
      paragraphs: [`I couldn't find a matching paragraph in the UCP 600 or ISBP 821 corpus loaded here. Try citing the article number directly (e.g. "UCP 14(c)" or "ISBP A19").`],
      citations: [], patches: [], contextArtifacts: [],
      reasoning: ['searching corpus', 'no hit'],
    };
  }
  const top = hits[0];
  const citers = cat.rulesCiting(top.id);
  const paragraphs = [
    `${top.id} — ${top.heading}: "${top.text}"`,
    citers.length
      ? `${citers.length} rule(s) currently cite ${top.id}: ${citers.map((r) => r.rule_id).join(', ')}.`
      : `No rule currently cites ${top.id}.`,
  ];
  if (hits.length > 1) {
    paragraphs.push(`Adjacent paragraphs to consider: ${hits.slice(1).map((h) => h.id).join(', ')}.`);
  }
  return {
    paragraphs,
    citations: hits,
    patches: [],
    contextArtifacts: [{ kind: 'ref', payload: top }],
    reasoning: [`reading ${top.id}`, 'cross-referencing catalogue'],
  };
};

const replyHistory = (text) => {
  const t = text.toLowerCase();
  if (RX.session.test(text)) {
    const id = text.match(RX.session)[1];
    const s = hist.findSession(id);
    if (!s) return {
      paragraphs: [`No session #${id} in the history fixture (${hist.totals().sessions} sessions on file).`],
      citations: [], patches: [], contextArtifacts: [],
      reasoning: ['loading history', 'session not found'],
    };
    const fails = s.ruleResults.filter((r) => r.verdict === 'FAIL');
    return {
      paragraphs: [
        `Session #${s.id} (${s.lc_number}) — ${s.compliant ? 'compliant' : 'NON-compliant'}. ${s.ruleResults.length} rules ran; ${fails.length} failed.`,
        fails.length
          ? `Failures: ${fails.map((f) => `${f.rule_id}${f.overridden ? ' (overridden — ' + (f.override_reason || 'no reason') + ')' : ''}`).join('; ')}.`
          : `All rules passed.`,
        s.fieldCorrections.length
          ? `Field corrections: ${s.fieldCorrections.map((f) => `${f.field_key}@${f.doc} (${f.kind})`).join(', ')}.`
          : `No field corrections recorded.`,
      ],
      citations: [], patches: [],
      contextArtifacts: [{ kind: 'session', payload: s }],
      reasoning: [`reading session #${s.id}`, 'tabulating verdicts'],
    };
  }
  if (RX.failMost.test(t)) {
    const top = hist.topFailed(5);
    return {
      paragraphs: [
        `Across the ${hist.totals().sessions}-session window (${hist.totals().windowDays}d), top rule failures by raw count:`,
        top.map((r) => `${r.rule_id}: ${r.fail}/${r.runs} fails (${Math.round(r.fail_rate * 100)}%), ${r.overrides} overridden`).join(' · '),
        `If override-rate ≫ fail-rate the rule is producing false positives — investigate prompt or tier.`,
      ],
      citations: [], patches: [], contextArtifacts: [],
      reasoning: ['aggregating verdicts', 'ranking by fail count'],
    };
  }
  // default → top overridden
  const top = hist.topOverridden(5);
  if (!top.length) {
    return {
      paragraphs: [`No overrides recorded in the ${hist.totals().sessions}-session window.`],
      citations: [], patches: [], contextArtifacts: [],
      reasoning: ['scanning override events', 'empty result'],
    };
  }
  const worst = top[0];
  const worstRule = cat.findRule(worst.rule_id);
  const paragraphs = [
    `Most-overridden rules in the last ${hist.totals().windowDays} days:`,
    top.map((r) => `${r.rule_id} — ${Math.round(r.override_rate * 100)}% override (${r.overrides}/${r.runs} runs)`).join(' · '),
    worst && worstRule
      ? `${worst.rule_id} ("${worstRule.name}") is the highest. ${worstRule.check_type === 'AGENT' ? 'It is AGENT-tier — high override usually means the prompt is too strict or the underlying check is determinable programmatically.' : 'It is programmatic — high override suggests the SpEL is too strict.'}`
      : '',
  ].filter(Boolean);
  const patches = [];
  if (worst && worstRule && worst.override_rate >= 0.5 && worstRule.check_type === 'AGENT') {
    patches.push(makeRuleUpdatePatch({
      rule: worstRule,
      field: 'severity',
      before: worstRule.severity,
      after: 'MAJOR',
      rationale: `Override rate is ${Math.round(worst.override_rate * 100)}%; downgrading severity reduces false-positive cost while you tune the prompt.`,
      citations: worstRule.isbp_refs || worstRule.ucp_refs || [],
    }));
  }
  return {
    paragraphs, citations: [], patches,
    contextArtifacts: worstRule ? [{ kind: 'rule', payload: worstRule }] : [],
    reasoning: ['scanning override events', 'ranking by rate', 'considering severity adjustment'],
  };
};

const replyImprove = (text) => {
  const m = text.match(RX.missing);
  if (m) {
    const doc = m[2].toUpperCase();
    const existing = cat.rulesByDoc(doc);
    const refRange = doc === 'BOL' ? ucpisbp.refsByArticleRange('UCP600', 19, 28)
      : doc === 'INV' ? ucpisbp.refsByArticleRange('UCP600', 14, 18)
      : doc === 'PKL' ? ucpisbp.refsByArticleRange('UCP600', 14, 14)
      : [];
    const cited = new Set(existing.flatMap((r) => [...(r.ucp_refs || []), ...(r.isbp_refs || [])]));
    const uncited = refRange.filter((r) => !cited.has(r.id)).slice(0, 3);
    const paragraphs = [
      `Catalogue has ${existing.length} rule(s) applying to ${doc}: ${existing.map((r) => r.rule_id).join(', ') || 'none'}.`,
      uncited.length
        ? `UCP paragraphs in the ${doc} range with no rule citing them: ${uncited.map((r) => r.id).join(', ')}.`
        : `Every UCP paragraph in the ${doc} range is already cited.`,
    ];
    const patches = uncited.slice(0, 2).map((c) => makeRuleCreatePatch({
      ruleId: nextRuleId(doc === 'INV' ? 'GOODS' : doc === 'BOL' ? 'TRANS' : 'EXAM'),
      name: c.heading.replace(/^.*?—\s*/, '').slice(0, 70),
      citation: c,
      rationale: `${c.id} is in scope for ${doc} but no rule cites it.`,
      sources: [],
      applies_to: [doc],
    }));
    return {
      paragraphs, citations: uncited, patches,
      contextArtifacts: existing.length ? [{ kind: 'rule', payload: existing[0] }] : [],
      reasoning: [`enumerating ${doc} rules`, 'diffing against UCP coverage', 'drafting patches for gaps'],
    };
  }
  // generic improve — synthesise from top-overridden + most-corrected fields
  const overridden = hist.topOverridden(3);
  const fieldCorr = hist.fieldCorrectionStats().slice(0, 3);
  const paragraphs = [
    `Reviewing the catalogue against recent operational signal:`,
    overridden.length
      ? `Override hot-spots: ${overridden.map((r) => `${r.rule_id} (${Math.round(r.override_rate * 100)}%)`).join(', ')}. These usually indicate a prompt or tier problem, not a missing rule.`
      : `No override pressure visible in history.`,
    fieldCorr.length
      ? `Most-corrected fields: ${fieldCorr.map((f) => `${f.field_key}@${f.doc} (${f.count}×)`).join(', ')}. Corrections of kind "model_wrong" point at the extraction prompt; "typo" points at a missing typographical-tolerance rule (ISBP A19).`
      : '',
  ].filter(Boolean);
  const a19 = ucpisbp.lookupRef('ISBP-A19');
  const patches = a19 && fieldCorr.some((f) => f.kinds && f.kinds.typo)
    ? [makeRuleCreatePatch({
        ruleId: nextRuleId('GOODS'),
        name: 'Tolerate typographical variations per ISBP A19',
        citation: a19,
        rationale: `Multiple sessions show "typo" corrections on buyer/goods fields without a corresponding tolerance rule. ISBP A19 explicitly permits non-material typographical variation.`,
        sources: hist.sessionsCitingReason('A19'),
        applies_to: ['INV'],
      })]
    : [];
  return {
    paragraphs, citations: a19 ? [a19] : [], patches,
    contextArtifacts: [],
    reasoning: ['reading override hot-spots', 'reading field-correction kinds', 'mapping signal to UCP/ISBP'],
  };
};

const replyExplainRule = (text) => {
  const m = text.match(/[A-Z]+-\d+/);
  if (!m) return replySmalltalk(text);
  const r = cat.findRule(m[0]);
  if (!r) return { paragraphs: [`No rule "${m[0]}" in the catalogue.`], citations: [], patches: [], contextArtifacts: [], reasoning: ['catalog lookup', 'not found'] };
  const refs = [...(r.ucp_refs || []), ...(r.isbp_refs || [])].map((id) => ucpisbp.lookupRef(id)).filter(Boolean);
  const stats = hist.ruleStats().find((s) => s.rule_id === r.rule_id);
  return {
    paragraphs: [
      `${r.rule_id} — "${r.name}". Tier ${r.check_type}, severity ${r.severity}; applies to ${(r.applies_to || []).join(', ') || '—'}.`,
      refs.length ? `Cites ${refs.map((x) => x.id).join(', ')}.` : `Cites no UCP/ISBP paragraphs — that's a governance smell.`,
      stats ? `History (${hist.totals().sessions} sessions): ${stats.runs} runs, ${stats.fail} fail, ${stats.overrides} overrides (rate ${Math.round(stats.override_rate * 100)}%).` : `No history runs recorded.`,
    ],
    citations: refs, patches: [],
    contextArtifacts: [{ kind: 'rule', payload: r }],
    reasoning: [`loading ${r.rule_id}`, 'joining citations + history'],
  };
};

const replySmalltalk = () => ({
  paragraphs: [
    `I'm a governance assistant — I draft rules, read UCP 600 / ISBP 821, and report on session history. Try one of the dictionary entries below the composer, or ask "what's missing for BOL?"`,
  ],
  citations: [], patches: [], contextArtifacts: [],
  reasoning: ['no actionable intent'],
});

// Public entrypoint ----------------------------------------------------------
export const respond = (input, { scope = 'all' } = {}) => {
  const text = (input || '').trim();
  if (!text) return replySmalltalk();
  const intent = classify(text);
  const fn = {
    draft_rule: replyDraftRule,
    search_ref: replySearchRef,
    history: replyHistory,
    improve: replyImprove,
    explain_rule: replyExplainRule,
    smalltalk: replySmalltalk,
  }[intent] || replySmalltalk;
  const out = fn(text);
  return { intent, scope, ...out };
};

export const QUICK_PROMPTS = [
  'Draft a rule from ISBP A19',
  'Which agent rules get overridden most?',
  "What's missing for BOL?",
  'Why did session #214 fail?',
  'Read UCP 14(h)',
];
