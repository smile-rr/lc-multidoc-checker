// The governance module's entry points. Kept in its own file (rather than in
// index.js) so GovernanceModule can import the list without a cycle through the
// module descriptor.
import { AGENT_LINK } from './features'

// Every section the module can render, and whether this build shows a way in.
// Agents is built and still routes — it just has no tab while AGENT_LINK is off
// (see features.js), so a stale /governance/agents link lands on Checks rather
// than on a screen that promises something the examination does not read.
const ALL = [
  { id: 'checks', label: 'Checks', icon: 'list-checks' },
  { id: 'agents', label: 'Agents', icon: 'bot', shown: AGENT_LINK },
  { id: 'dictionary', label: 'Dictionary', icon: 'book-open' },
  { id: 'library', label: 'Library', icon: 'library' },
]

export const SECTIONS = ALL.filter((s) => s.shown !== false)
