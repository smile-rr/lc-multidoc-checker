/**
 * Checking an expression against the rulebook's own dictionary.
 *
 * <p>Two questions are asked of a condition, and only one of them is about documents.
 *
 * <p><b>Is it well formed, and is it safe?</b> That belongs to {@code harness.expr}, which
 * owns the grammar, the allow list over the parsed tree, and what happens when a value was
 * never read. It knows nothing about credits, and it must not: the same engine answers a
 * console's simulator and backs a tool a model may call.
 *
 * <p><b>Does {@code {BOL.on_board_date}} name something anybody reads?</b> That is this
 * package. The engine cannot ask it, and it is the more common mistake by far — a typo parses
 * perfectly. Left alone, such a condition compiles, plans, runs, and returns "could not be
 * settled" on every presentation for ever, looking exactly like a check that ran and found
 * nothing wrong.
 *
 * <p>The split matters because the two move at different speeds. The grammar is settled and
 * changes with the engine; the dictionary changes whenever somebody binds a new field, and a
 * condition that was valid last week can stop being so — which is a thing the console should
 * say plainly rather than a thing the run should discover.
 *
 * <p>Reached through {@link com.tb.helix.governance.spi.ExpressionRules}, because the planner
 * needs it and lc-check may see only the governance model.
 */
package com.tb.helix.governance.expression;
