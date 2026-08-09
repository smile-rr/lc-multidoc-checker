// The governance module's entry points. Kept in its own file (rather than in
// index.js) so GovernanceModule can import the list without a cycle through the
// module descriptor.
export const SECTIONS = [
  { id: 'checks', label: 'Checks', icon: 'list-checks' },
  { id: 'agents', label: 'Agents', icon: 'bot' },
  { id: 'dictionary', label: 'Dictionary', icon: 'book-open' },
  { id: 'library', label: 'Library', icon: 'library' },
  // There was a Simulator here: a condition typed into a page of its own, with a picker
  // for loading a stored table into it. Trying a check now happens on the check, in its
  // own Try panel — which is where the answer is wanted and where the table under test is
  // the one that will actually run. A page that loads a COPY of a table is a page where
  // the thing being tried and the thing being saved drift apart without saying so.
  // Disposable ops surface over helix_infra.model_price — keep thin; easy to hide later.
  // Nav says Models (the book); the page is still standing rates, not slot config.
  { id: 'prices', label: 'Models', icon: 'cpu' },
]
