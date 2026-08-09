/**
 * A decision table: conditions in order, and the first that holds decides.
 *
 * <h2>Why it is here and not in the rulebook</h2>
 *
 * <p>{@link com.tb.helix.harness.table.DecisionTable} was filed under {@code governance.types},
 * beside the tree language, on no stronger ground than that checks are authored there. But it
 * knows nothing about checks. It cuts {@code WHEN … THEN …} out of a string, walks the branches
 * in order, and asks a caller to settle each one — {@code {BOL.on_board_date} <= …} is text it
 * hands over and never looks inside.
 *
 * <p>What it cost being filed there: taking the table meant taking {@code ConditionTree},
 * {@code Operator}, {@code CheckType} and {@code Tier} with it — the tree language it replaces.
 *
 * <h2>It sits beside the engine because it is the layer above it</h2>
 *
 * <pre>
 *   harness/table   WHEN / THEN / ELSE          the table, and what a branch answers
 *   harness/expr    the condition language      one branch at a time, three-valued
 * </pre>
 *
 * <p>Two levels, and the split is what makes the safety property hold. SpEL's own conditionals
 * — {@code a ? b : c} and {@code a ?: b} — are refused by the grammar below, because either can
 * turn "nothing was read" into a confident answer. Branching above the engine rather than
 * inside it is what keeps that refusal intact while still letting a check answer more than
 * yes or no.
 *
 * <h2>The one opinion it holds</h2>
 *
 * <p>{@code Verdict} is {@code CLEAN}, {@code DOUBT}, {@code DISCREPANT} and there is no
 * fourth. That is examination vocabulary rather than trade vocabulary — any system that checks
 * something and reports on it has these three — and it is deliberately <b>not</b> a type
 * parameter. Generifying it would buy portability to a system that does not exist at a cost
 * every call site pays for ever; another product edits one enum instead.
 *
 * <h2>Nothing but the JDK</h2>
 *
 * <p>No Spring, no logging, no framework of any kind, and an ArchUnit rule holds it that way.
 * A table is data and a walk over it — the moment it needs an injected collaborator, something
 * that is not the table's business has been put inside it.
 */
package com.tb.helix.harness.table;
