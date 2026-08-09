/**
 * An expression engine: a condition a person can read, checked before it runs.
 *
 * <h2>What it is for</h2>
 *
 * <p>Somewhere above this, a rule says {@code {BOL.on_board_date} > {LC.latest_shipment_date}}.
 * This package knows nothing about bills of lading, credits or shipment — it sees
 * {@code {a} > {b}}, two names it will be given values for. That is the whole of its
 * neutrality, and it is what lets the same engine settle a rule, answer a console's
 * simulator, and back a tool a model may call.
 *
 * <h2>Three jobs, in order</h2>
 *
 * <ol>
 *   <li><b>Rewrite.</b> Every {@code {name}} becomes a variable, and the names are recorded
 *       with their offsets into the original text — which is how a caller renders the
 *       expression back with values substituted, without arithmetic on the rewritten string.
 *   <li><b>Whitelist.</b> The parsed tree is walked and every node's class must be on an
 *       allow list. This is the security boundary, and it is the reason this package exists
 *       as a package: an expression is written by a model, and Spring's expression language
 *       reaches static methods, constructors and the bean factory unless something stops it.
 *   <li><b>Run.</b> Each comparison is settled on its own so the caller gets a row per
 *       comparison rather than one boolean, and the {@code and}/{@code or} above them is
 *       composed here, in Java, over three values rather than two.
 * </ol>
 *
 * <h2>Absence is not falsehood</h2>
 *
 * <p>A value that was never read is <em>unknown</em>, never false. A leaf with an unknown
 * operand is not evaluated at all — Spring's comparator treats {@code null} as less than
 * everything, so an unread date would otherwise settle a comparison confidently and wrongly.
 *
 * <p>Above the leaves, the boolean skeleton is run twice: once with every unknown forced true,
 * once forced false. Agreement means the answer was forced by what <em>was</em> read;
 * disagreement is unknown. That is exact rather than merely cautious — but only while the
 * formula is monotone, which is why {@code !}, boolean {@code !=}, {@code ?:} and elvis are
 * refused at compile time. With negation the two runs can agree on an answer that is wrong for
 * a mixed assignment, and a false definite is worse than no answer.
 *
 * <h2>The verbs are contributed, not built in</h2>
 *
 * <p>{@code #same} and {@code #daysBetween} are neutral and ship here. Whether two party names
 * denote the same party is not neutral, and belongs to whoever knows what a party is — so
 * {@link com.tb.helix.harness.expr.VerbSpec} is registered by the module that understands it,
 * the same arrangement {@code ToolSpec} uses and for the same reason.
 *
 * <h2>One condition at a time, and nothing above it</h2>
 *
 * <p>This settles <em>one</em> condition. What decides which condition to ask next, and what a
 * check answers when one holds, is {@link com.tb.helix.harness.table.DecisionTable} — a layer
 * up, and one this package must never learn about. The split is what keeps the refusals here
 * intact: {@code a ? b : c} and {@code a ?: b} are rejected by the grammar because either can
 * turn "nothing was read" into a confident answer, so branching happens <em>above</em> the
 * engine rather than inside it. A table is also answered by an examiner, not only by this, and
 * nothing here should be able to tell the difference.
 *
 * <h2>The one import rule</h2>
 *
 * <p>This is the only package that may import {@code org.springframework.expression}, and the
 * build enforces it. An expression parser is safe only while exactly one package can reach it:
 * a {@code StandardEvaluationContext} anywhere else is a remote code execution.
 */
package com.tb.helix.harness.expr;
