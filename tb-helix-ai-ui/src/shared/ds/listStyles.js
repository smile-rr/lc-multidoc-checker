// Shared "list table" chrome so every section's list view looks identical:
// white card + soft shadow, an uppercase header row, grey-08 row dividers.
export const listWrap = { background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }
export const listHead = { padding: '10px 16px', borderBottom: '1px solid var(--me-grey-15)', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)' }
export const listRow = { padding: '12px 16px', borderBottom: '1px solid var(--me-grey-08)', alignItems: 'center' }
