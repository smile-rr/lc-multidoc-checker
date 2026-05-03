// 9-type attention chip rendering metadata.
// Tags emitted server-side by RuleCatalogJoiner.computeAttention.
export const ATTENTION_CHIPS = {
  'LOW-CONF-PASS':    { label: 'LOW-CONF PASS',    color: '#8a5700', bg: '#fefce8' },
  'SPLIT':            { label: 'SPLIT',            color: '#8a5700', bg: '#fefce8' },
  'AGENT-DISAGREE':   { label: 'AGENT-DISAGREE',   color: '#8a5700', bg: '#fefce8' },
  'HANDWRITING':      { label: 'HANDWRITING',      color: '#8a5700', bg: '#fefce8' },
  'AGENT-UNRELIABLE': { label: 'AGENT UNRELIABLE', color: '#cc0011', bg: '#fff1f0' },
  'MANUAL-SUGGESTED': { label: 'MANUAL SUGGESTED', color: '#cc0011', bg: '#fff1f0' },
  'AGENT-DISABLED':   { label: 'AGENT DISABLED',   color: '#6e6e73', bg: '#f5f5f7' },
  'OVERRIDDEN':       { label: 'OVERRIDDEN ✎', color: '#0066cc', bg: '#eff6ff' },
  'FLAGGED':          { label: 'FLAGGED ⚑',   color: '#cc0011', bg: '#fff1f0' },
};
