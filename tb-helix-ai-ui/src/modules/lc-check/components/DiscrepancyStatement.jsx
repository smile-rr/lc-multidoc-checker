// The formal one-line statement of a finding.
//
// In practice this is the wording that goes out in the refusal advice (MT734
// field 77J), so it is short, quotable and written in the register a checker
// writes in. That makes it a different artefact from the title (a readable
// headline) and from the analysis (the reasoning) — and it is the line an officer
// scans a decision list by, because it is the one they will have to defend.
//
// Monospace and upper case is not decoration: it is how the statement will
// actually appear on the wire.
export default function DiscrepancyStatement({ text, tone, compact, onSurface }) {
  if (!text) return null
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: compact ? 11 : 11.5,
        lineHeight: 1.55,
        color: 'var(--me-ink)',
        // White when it sits on a recessed surface, grey when on white — either
        // way it stays a distinct block rather than merging with its container.
        background: onSurface ? '#fff' : 'var(--me-grey-08)',
        borderLeft: `2px solid ${tone ?? 'var(--me-grey-20)'}`,
        padding: compact ? '5px 8px' : '8px 11px',
        borderRadius: '0 4px 4px 0',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  )
}
