// Token resolver — substitutes {{kind.path}} tokens in a template
// using rule, refs, and sample data. Mirrors the runtime contract.

const TOKEN_RE = /\{\{\s*([a-zA-Z_][\w]*(?:\.[\w\-]+)*)\s*\}\}/g;

const dig = (obj, path) => {
  if (!obj) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
};

export function resolveTokens(template, ctx) {
  const { rule, refs, sample } = ctx;
  const refIndex = {};
  for (const r of [...(refs?.ucp600 || []), ...(refs?.isbp821 || [])]) refIndex[r.id] = r;

  return template.replace(TOKEN_RE, (match, path) => {
    const [head, ...rest] = path.split('.');

    if (head === 'rule' && rule) {
      const v = rule[rest.join('.')] ?? rule[rest[0]];
      if (v == null) return `‹unresolved: ${path}›`;
      if (Array.isArray(v)) return v.join(', ');
      return String(v);
    }

    if (head === 'ref') {
      // {{ref.UCP-14-c}} or {{ref.UCP-14-c.text}}
      const id = rest[0];
      const prop = rest[1] || 'text';
      const r = refIndex[id];
      if (!r) return `‹unresolved ref: ${id}›`;
      return r[prop] ?? `‹ref ${id} has no ${prop}›`;
    }

    if (head === 'lc') {
      // {{lc.field}}, {{lc.raw.45A}}, {{lc.fullText}}
      const v = dig(sample?.lc, rest.join('.'));
      if (v == null) return `‹unresolved: ${path}›`;
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }

    if (head === 'doc') {
      // {{doc.INV.field}} etc.
      const v = dig(sample?.doc, rest.join('.'));
      if (v == null) return `‹unresolved: ${path}›`;
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }

    if (head === 'system') {
      const v = dig(sample?.system, rest.join('.'));
      return v == null ? `‹unresolved: ${path}›` : String(v);
    }

    return `‹unknown: ${path}›`;
  });
}

// Returns { tokens, declared, undeclared } where declared/undeclared are sets
// based on the rule's catalog contract (field_keys + ucp_refs + isbp_refs).
export function validateTokens(template, rule) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(template)) !== null) tokens.push(m[1]);

  const allowedFields = new Set(rule?.field_keys || []);
  const allowedRefs = new Set([...(rule?.ucp_refs || []), ...(rule?.isbp_refs || [])]);

  const issues = [];
  for (const t of tokens) {
    const [head, p1, p2] = t.split('.');
    if (head === 'lc') {
      const key = p1 === 'raw' ? null : p1; // raw.<tag> not field-bound
      if (key && !allowedFields.has(key)) {
        issues.push({ token: t, kind: 'undeclared-field',
          message: `LC field "${key}" not in rule.field_keys` });
      }
    } else if (head === 'doc') {
      const key = p2;
      if (key && key !== 'fullText' && !allowedFields.has(key)) {
        issues.push({ token: t, kind: 'undeclared-field',
          message: `Doc field "${key}" not in rule.field_keys` });
      }
    } else if (head === 'ref') {
      if (p1 && !allowedRefs.has(p1)) {
        issues.push({ token: t, kind: 'undeclared-ref',
          message: `Citation "${p1}" not in rule.ucp_refs/isbp_refs` });
      }
    }
  }
  return { tokens: [...new Set(tokens)], issues };
}
