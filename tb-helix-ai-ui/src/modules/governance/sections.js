// The governance module's entry points. Kept in its own file (rather than in
// index.js) so GovernanceModule can import the list without a cycle through the
// module descriptor.
export const SECTIONS = [
  { id: 'checks', label: 'Checks', icon: 'list-checks' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'dictionary', label: 'Dictionary', icon: 'book-open' },
  { id: 'library', label: 'Library', icon: 'library' },
  // Beside the catalogue rather than inside a check, because the two things it is for —
  // writing a condition before there is a check, and reproducing what a stored one did —
  // both start without one selected.
  { id: 'simulator', label: 'Simulator', icon: 'flask-conical' },
  // Disposable ops surface over helix_infra.model_price — keep thin; easy to hide later.
  // Nav says Models (the book); the page is still standing rates, not slot config.
  { id: 'prices', label: 'Models', icon: 'cpu' },
]
