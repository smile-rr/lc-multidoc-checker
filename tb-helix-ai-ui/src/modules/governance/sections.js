// The governance module's entry points. Kept in its own file (rather than in
// index.js) so GovernanceModule can import the list without a cycle through the
// module descriptor.
export const SECTIONS = [
  { id: 'checks', label: 'Checks', icon: 'list-checks' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'dictionary', label: 'Dictionary', icon: 'book-open' },
  { id: 'library', label: 'Library', icon: 'library' },
]
