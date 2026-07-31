// What this build of the console has switched on.
//
// AGENT_LINK — whether a check can be put in an agent.
//
// Agents are a placeholder for now. Nothing in an examination reads one: the
// plan selects rule cards from the catalogue directly, and the execute step
// runs them by tier, so an agent is a grouping with no consequence. A control
// that changes nothing is worse than an absent one — it invites an author to
// spend an afternoon arranging checks into agents that will never be consulted.
//
// So the link is off, and with it the Agents tab, the "Add to agent" menu, the
// In Agent column and grouping by agent. **The agents themselves stay**: the
// seed still carries them, the service still stores and serves the `agent`
// documents, `placements` still records where a check was put, and the Agents
// section is still built. Only the ways in are gone.
//
// Turning it back on is this one line.
export const AGENT_LINK = false
