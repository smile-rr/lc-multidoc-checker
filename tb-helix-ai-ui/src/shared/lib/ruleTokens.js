// The vocabulary a plain-language check is written in.
//
// Extracted from the governance rule editor so a rule reads identically wherever
// it appears — being authored in Governance, or being shown to an officer in an
// LC check. One tokenizer, one set of colours; a rule must not look like two
// different things in two places.
//
// Keywords are highlighted to make the logic scannable (and to give the model a
// clear scaffold). They are not required and not validated: rules stay free-form
// natural language.

export const KW_STRUCT = [
  'when', 'whenever', 'if', 'unless', 'where', 'given', 'while', 'once',
  'then', 'otherwise', 'else', 'because', 'since', 'therefore', 'so that',
  'and', 'or', 'not', 'but', 'except', 'either', 'both', 'neither', 'any', 'all', 'none', 'only',
  'before', 'after', 'within', 'at least', 'at most', 'no later than', 'no earlier than',
  'same as', 'consistent with', 'corresponds to', 'matches', 'equals',
  'flag', 'raise', 'warn', 'hold', 'require', 'confirm', 'escalate', 'reject', 'waive',
]

export const KW_MODAL = ['must not', 'must', 'should not', 'should', 'may']

const alt = (arr) =>
  arr
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|')

/** Groups: 1 = {field}, 2 = UCP/ISBP reference, 3 = modal verb, 4 = structural keyword. */
export const RULE_TOKEN_RE = new RegExp(
  '(\\{[^}\\n]*\\})' +
    '|(UCP\\s?600(?:\\s?art\\.?\\s?\\d+(?:\\([a-z0-9]+\\))*)?|ISBP\\s?821(?:\\s?[A-Z]?\\d*)?)' +
    `|\\b(${alt(KW_MODAL)})\\b` +
    `|\\b(${alt(KW_STRUCT)})\\b`,
  'gi',
)

/** Colours for each token kind, shared by the editor and the read-only renderer. */
export const RULE_TOKEN_STYLE = {
  field: { color: 'var(--me-blue-deep)', background: 'var(--me-blue-20)', borderRadius: 3, padding: '1px 3px' },
  ref: { color: 'var(--me-blue-deep)' },
  modal: { color: '#946400', fontWeight: 700 },
  kw: { color: 'var(--me-navy)', fontWeight: 600 },
}

/**
 * Split rule text into typed spans for rendering.
 * @param {string} text
 * @returns {{ kind: 'text'|'field'|'ref'|'modal'|'kw', text: string }[]}
 */
export function tokeniseRule(text) {
  const src = String(text ?? '')
  const out = []
  let last = 0
  let m
  RULE_TOKEN_RE.lastIndex = 0

  while ((m = RULE_TOKEN_RE.exec(src)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    out.push({ kind: m[1] ? 'field' : m[2] ? 'ref' : m[3] ? 'modal' : 'kw', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}
