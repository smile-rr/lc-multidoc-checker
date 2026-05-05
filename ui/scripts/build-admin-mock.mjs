// Builds ui/src/admin/mockData.json from real backend resources.
// Run: cd ui && node scripts/build-admin-mock.mjs
//
// Sources (read-only; never written by this script):
//   resources/rules/catalog-v3.yml       — design catalog (33 rules, full structure)
//   resources/refs/{ucp600,isbp821}.yaml — golden source refs
//   resources/fields/field-pool.yaml     — canonical field catalog
//   resources/prompts/check/*.tokenized.st — tokenized prompt bodies
//   resources/prompts/extract/*.st       — vision extraction prompts
//   resources/prompts/system/*.st        — system + planner prompts

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = join(__dirname, '..', '..', 'lc-checker-v2-svc', 'src', 'main', 'resources');
const OUT = join(__dirname, '..', 'src', 'admin', 'mockData.json');

const readYaml = (p) => yaml.load(readFileSync(p, 'utf8'));
const readText = (p) => readFileSync(p, 'utf8');

const catalogV3 = readYaml(join(RES, 'rules', 'catalog-v3.yml'));
const ucp = readYaml(join(RES, 'refs', 'ucp600.yaml'));
const isbp = readYaml(join(RES, 'refs', 'isbp821.yaml'));
const fieldPool = readYaml(join(RES, 'fields', 'field-pool.yaml'));

// ─── Build prompts list ──────────────────────────────────────────────────────
// Strategy:
//   - Each LLM-tier rule (AGENT*/AGENTIC) declares prompt_path = prompts/check/<rule_id>.tokenized.st
//   - We read those bodies and create a prompt entry per rule
//   - Also surface system/extract prompts as separate kinds
const prompts = [];

let unauthoredCount = 0;
for (const r of catalogV3.rules || []) {
  if (!r.prompt_path) continue;
  const abs = join(RES, r.prompt_path);
  const exists = existsSync(abs);
  if (!exists) unauthoredCount++;
  prompts.push({
    id: `check/${r.rule_id}`,
    kind: 'check',
    boundRuleId: r.rule_id,
    filename: basename(r.prompt_path),
    path: r.prompt_path,
    version: 1,
    state: exists ? 'PUBLISHED' : 'DRAFT',
    owner: 'aarav',
    lastEditedAt: '2026-04-21T10:14:00Z',
    body: exists ? readText(abs) : '',
    isTokenized: true,
    isAuthored: exists,
  });
}

const readPromptDir = (sub, kind) => {
  const dir = join(RES, 'prompts', sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.st') && !f.endsWith('.tokenized.st'))
    .map((f) => ({
      id: `${sub}/${basename(f, '.st')}`,
      kind,
      boundRuleId: null,
      filename: f,
      path: `prompts/${sub}/${f}`,
      version: 1,
      state: 'PUBLISHED',
      owner: 'aarav',
      lastEditedAt: '2026-04-21T10:14:00Z',
      body: readText(join(dir, f)),
      isTokenized: false,
    }));
};

prompts.push(...readPromptDir('extract', 'extract'));
prompts.push(...readPromptDir('system', 'system'));

// ─── Build rules list ────────────────────────────────────────────────────────
// Patch each rule with synthetic governance metadata for the prototype.
// The catalog-v3 file already carries health_signals + eval_cases + policy_overlays;
// we just spread synthetic state per-rule for the lifecycle demo.
const rules = (catalogV3.rules || []).map((r, idx) => {
  // Synthesize a workflow state spread for the lifecycle board
  let state = 'PUBLISHED';
  let draftAuthor = null;
  if (idx === 1) state = 'IN_REVIEW';
  else if (idx === 4) state = 'DRAFT';
  else if (idx === 9) state = 'STAGED';
  else if (idx === 14) state = 'SHADOW';
  else if (idx === 19) state = 'IN_REVIEW';

  if (state === 'DRAFT' || state === 'IN_REVIEW') draftAuthor = 'maya';
  if (state === 'STAGED' || state === 'SHADOW') draftAuthor = 'ling';

  // Map tier from check_type
  const tier = r.check_type;

  // Find bound prompt id (if AGENT*-tier and prompt file exists)
  const boundPromptId = r.prompt_path
    ? `check/${r.rule_id}`
    : null;
  const boundPromptState = boundPromptId ? 'PUBLISHED' : null;

  return {
    rule_id: r.rule_id,
    name: r.name,
    category: r.category,
    enabled: r.enabled !== false,
    version: r.version || 1,
    severity: r.severity,
    polarity: r.polarity,
    waivable: r.waivable,
    applies_to: r.applies_to || [],
    triggers: r.triggers || {},
    lc_fields_required: r.lc_fields_required || [],
    field_keys: r.field_keys || [],
    ucp_refs: r.ucp_refs || [],
    isbp_refs: r.isbp_refs || [],
    check_type: tier,
    prompt_path: r.prompt_path || null,
    expression: r.expression || null,
    output_schema: r.output_schema || null,
    health_signals: r.health_signals || {},
    policy_overlays: r.policy_overlays || {},
    eval_cases: r.eval_cases || [],

    // Governance metadata
    state,
    publishedVersion: state === 'PUBLISHED' ? r.version : Math.max(1, (r.version || 1) - 1),
    workingVersion: r.version,
    draftAuthor,
    boundPromptId,
    boundPromptState,
    lastEditedAt: '2026-04-' + String(10 + (idx % 20)).padStart(2, '0') + 'T09:00:00Z',
    lastEditedBy: state === 'PUBLISHED' ? 'maya' : draftAuthor,
  };
});

// ─── Field pool ──────────────────────────────────────────────────────────────
const fields = (fieldPool.fields || []).map((f) => ({
  key: f.key,
  name_en: f.name_en,
  type: f.type,
  applies_to: f.applies_to || [],
  source_tags: f.source_tags || [],
  group: f.group,
  rule_relevant: f.rule_relevant ?? true,
}));

// ─── Personas ────────────────────────────────────────────────────────────────
const users = [
  { id: 'maya', name: 'Maya Chen',     role: 'Compliance Lead',     avatar: 'MC', owns: ['rule.definition', 'rule.citations', 'rule.severity'] },
  { id: 'david', name: 'David Okafor', role: 'Compliance Reviewer', avatar: 'DO', owns: ['rule.review.approve'] },
  { id: 'aarav', name: 'Aarav Singh',  role: 'Prompt Engineer',     avatar: 'AS', owns: ['prompt.body', 'prompt.fields', 'system.prompt'] },
  { id: 'ling', name: 'Ling Park',     role: 'Dev / QA',            avatar: 'LP', owns: ['lifecycle.stage', 'lifecycle.publish', 'eval.run'] },
];

// ─── Lifecycle event log (illustrative) ──────────────────────────────────────
const lifecycleEvents = [
  { id: 'e1', artifact: 'rule', artifactId: 'AMT-02',   from: 'PUBLISHED', to: 'IN_REVIEW',
    actor: 'maya',  at: '2026-04-22T08:10:00Z', note: 'Tightening UCP 30(b) tolerance language.' },
  { id: 'e2', artifact: 'rule', artifactId: 'GOODS-01', from: 'PUBLISHED', to: 'STAGED',
    actor: 'ling',  at: '2026-04-28T16:11:00Z', note: 'Staged after eval bundle 04-28; awaiting publish window.' },
  { id: 'e3', artifact: 'rule', artifactId: 'PARTY-04', from: 'PUBLISHED', to: 'SHADOW',
    actor: 'ling',  at: '2026-05-01T10:00:00Z', note: 'Shadow run; collecting verdict-agreement vs production.' },
  { id: 'e4', artifact: 'prompt', artifactId: 'check/AMT-02', from: 'PUBLISHED', to: 'DRAFT',
    actor: 'aarav', at: '2026-04-25T09:30:00Z', note: 'Re-aligning prompt with new tolerance language.' },
  { id: 'e5', artifact: 'rule', artifactId: 'CERT-02',  from: 'PUBLISHED', to: 'IN_REVIEW',
    actor: 'maya',  at: '2026-05-02T14:20:00Z', note: 'High doubts-rate; revisiting decision rules.' },
];

// ─── Sample resolution data — for Resolved Preview ──────────────────────────
const sampleResolution = {
  system: {
    today: '2026-05-05',
    presentationDate: '2026-04-15',
    outputSchema: '<resolved at runtime from rule.output_schema>',
  },
  lc: {
    goods_description: '100 SETS OF CNC LATHE MACHINE MODEL X-200, CIF SINGAPORE',
    incoterms: 'CIF SINGAPORE',
    credit_amount: '250000.00',
    credit_currency: 'USD',
    about_credit_amount: 'false',
    tolerance_plus: '5',
    tolerance_minus: '5',
    lc_quantity: '100 SETS',
    beneficiary_name: 'PRECISION INDUSTRIES PTE LTD',
    expiry_date: '2026-05-31',
    latest_shipment_date: '2026-04-30',
    raw: { '32B': 'USD250000,00', '39A': '5/5', '45A': '100 SETS OF CNC LATHE MACHINE\n  MODEL X-200\n  CIF SINGAPORE' },
    fullText: '<full MT700 message — ~2 KB — omitted in preview>',
  },
  doc: {
    INV: {
      goods_description: '100 sets of CNC Lathe X-200, CIF SIN per Incoterms 2020',
      line_items: '[{model:"X-200", qty:100, unit:"USD 2487.50"}]',
      incoterms: 'CIF SIN',
      invoice_total: '248750.00',
      invoice_currency: 'USD',
      corrections_present: 'false',
      corrections_authenticated: 'n/a',
      fullText: '<extracted invoice text — omitted>',
    },
    BOL: {
      goods_description: 'INDUSTRIAL MACHINERY',
      clean_indicator: 'true',
      off_schema: '[]',
      port_of_loading: 'SHANGHAI',
      port_of_discharge: 'SINGAPORE',
      shipment_date: '2026-04-12',
      bl_date: '2026-04-12',
      onboard_notation: 'pre-printed',
      corrections_present: 'true',
      corrections_authenticated: 'true',
      signed_by: 'COSCO Lines as carrier',
      fullText: '<extracted B/L text — omitted>',
    },
    PKL: {
      goods_description: '100 cases CNC Lathe X-200',
      total_packages: '100',
      total_weight: '12500 KG',
      shipping_marks: 'CASE 1-100',
      corrections_present: 'false',
      corrections_authenticated: 'n/a',
      fullText: '<extracted packing list text — omitted>',
    },
    BOE: {
      draft_amount: '248750.00',
      draft_currency: 'USD',
      drawee_name: 'BANK OF SINGAPORE',
      boe_date: '2026-04-15',
      corrections_present: 'false',
      corrections_authenticated: 'n/a',
    },
    BC: {
      bc_signature_present: 'true',
      bc_certifying_party: 'PRECISION INDUSTRIES PTE LTD',
      bc_conditions_text: 'We certify the goods are of EU origin and were inspected on 2026-04-10.',
      corrections_present: 'false',
      corrections_authenticated: 'n/a',
    },
  },
};

// ─── Categories metadata ─────────────────────────────────────────────────────
const categories = [
  { id: 'DATE',   name: 'Date conformance',   ucp: 'UCP 14(c), 14(i)' },
  { id: 'DOCSET', name: 'Document set',       ucp: 'UCP 14(a), 17, 20(a)(iv)' },
  { id: 'AMT',    name: 'Currency & amount',  ucp: 'UCP 18, 30' },
  { id: 'PARTY',  name: 'Parties',            ucp: 'UCP 18(a), 6, 38' },
  { id: 'GOODS',  name: 'Goods description',  ucp: 'UCP 18(c), 14(d), 14(e)' },
  { id: 'TRANS',  name: 'Transport',          ucp: 'UCP 19–25, 27' },
  { id: 'INS',    name: 'Insurance',          ucp: 'UCP 28' },
  { id: 'CERT',   name: 'Certificates',       ucp: 'ISBP Q' },
  { id: 'EXAM',   name: 'General examination', ucp: 'UCP 14(d), ISBP A' },
];

// ─── Output ─────────────────────────────────────────────────────────────────
const out = {
  generatedAt: new Date().toISOString(),
  catalogVersion: catalogV3.catalog_version || '3.0.0-design',
  rules,
  prompts,
  refs: { ucp600: ucp.refs || [], isbp821: isbp.refs || [] },
  fields,
  categories,
  users,
  lifecycleEvents,
  sampleResolution,
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`  catalog=${out.catalogVersion}`);
const enabledCount = rules.filter((r) => r.enabled).length;
console.log(`  rules=${rules.length} (${enabledCount} enabled · ${rules.length - enabledCount} disabled)`);
console.log(`  prompts=${prompts.length} (${unauthoredCount} unauthored)`);
console.log(`  ucp=${out.refs.ucp600.length} isbp=${out.refs.isbp821.length} fields=${fields.length}`);
console.log(`  eval_cases=${rules.reduce((n, r) => n + (r.eval_cases?.length || 0), 0)}`);
