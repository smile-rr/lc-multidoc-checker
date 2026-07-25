import { tokeniseRule, RULE_TOKEN_STYLE } from '../lib/ruleTokens'

// A check rule, rendered read-only with the same highlighting the governance
// editor uses. Span-based rather than a read-only CodeMirror instance: these
// appear several to a screen, and mounting an editor per rule to display text
// nobody is editing is a lot of machinery for no behaviour.
//
// Blank lines are preserved — authors use them to separate the rule from the
// fields it reads.
export default function RuleText({ text, size = 13.5, style }) {
  if (!text) return null
  return (
    <div
      style={{
        fontSize: size,
        lineHeight: 1.75,
        color: 'var(--me-ink)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        ...style,
      }}
    >
      {tokeniseRule(text).map((tok, i) =>
        tok.kind === 'text' ? (
          <span key={i}>{tok.text}</span>
        ) : (
          <span key={i} style={RULE_TOKEN_STYLE[tok.kind]}>
            {tok.text}
          </span>
        ),
      )}
    </div>
  )
}
