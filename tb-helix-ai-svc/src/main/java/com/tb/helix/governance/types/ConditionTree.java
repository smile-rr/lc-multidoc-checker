package com.tb.helix.governance.types;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The shape of an authored condition, and the one place that decides what that shape is.
 *
 * <p>A condition is groups of rows; a row compares a field on one document against a field on
 * another, or against a value the credit states. It is written by the console, written by the
 * planner out of {@code :46A:}/{@code :47A:}, stored as jsonb, evaluated by the rule engine,
 * flattened for the plan screen and quoted on a finding — six consumers of one shape.
 *
 * <p>Until this class existed each of them parsed it again, out of nested {@code Map}s, with
 * its own idea of what was optional: the evaluator tolerated a group with no rows, the
 * compiler rejected it, and the plan screen's flattener silently dropped one. That is how a
 * format drifts — not by anybody changing it, but by nobody owning it.
 *
 * <h2>Not a JSON Schema</h2>
 *
 * <p>Deliberately. A schema document would be a second statement of the same thing, published
 * beside the code that ignores it, and it could not express the half that matters — whether
 * {@code INV.invoice_value} is a field anything actually extracts. That check belongs to the
 * dictionary and lives in {@code RuleCompiler}. What is here is the shape; what is there is
 * the vocabulary. Neither is guessed at, and neither is stated twice.
 *
 * <h2>The version is a floor, not a stamp</h2>
 *
 * <p>{@code v} is <b>the lowest reader that may evaluate this tree</b>, not the version it
 * was written by. A tree using nothing but v1 features stays v1 for ever, whoever wrote it;
 * one that uses a v2 operand says {@code v: 2} and an older service <em>refuses</em> it rather
 * than evaluating the half it understands. That distinction is the whole point: a reader that
 * skips an operand it does not recognise reports a comparison nobody made.
 *
 * <p>Absent means 1 — every tree authored before the field existed is a v1 tree, and it is.
 */
public record ConditionTree(int version, String scope, String message, List<Group> groups) {

    /**
     * What this build can evaluate. Bumped by the release that adds the feature, never before.
     *
     * <ul>
     *   <li><b>1</b> — groups of rows; an operand is a field on a document or a fixed value.
     *   <li><b>2</b> — an operand may also be a {@link ConditionFn} over other operands, and
     *       may name {@link #ANY_DOCUMENT} instead of one document.
     * </ul>
     */
    public static final int SUPPORTED = 2;

    /**
     * "Whichever documents carry this field", as an operand's document.
     *
     * <p>What a credit says is "the beneficiary's name on all documents to agree with field
     * 59" — one demand, not one demand per document. Without this a planner had to guess the
     * presentation from the credit and write a row per guess, so a document it did not think
     * of went unchecked and one it invented was INCONCLUSIVE for ever.
     *
     * <p>Expanded when the rule is evaluated, against the documents actually presented, so
     * the rows an officer sees are the comparisons that were really made.
     */
    public static final String ANY_DOCUMENT = "*";

    /**
     * Rows that settle together.
     *
     * @param any       "any of these" rather than "all of these"
     * @param connector how this group joins the one above it. Meaningless on the first.
     */
    public record Group(String id, boolean any, String connector, List<Row> rows) {
    }

    /**
     * One comparison.
     *
     * @param tol the author's free-text qualifier — "5%", "21 calendar days". Only three
     *            operators read it ({@link Operator#usesTol()}); on the rest it is inert, and
     *            the console says so rather than letting it look like an instruction.
     */
    public record Row(String id, Operator op, Operand left, Operand right, String tol) {
    }

    /**
     * One side of a comparison, as authored — a pointer, never a value.
     *
     * <p>What it points at is resolved against the facts of one case at evaluation time, and
     * the resolution is deliberately not stored here: the same row runs against every
     * presentation this bank ever examines.
     */
    public record Operand(String doc, String field, String literal,
                         ConditionFn fn, List<Operand> args) {

        private static final Operand NONE = new Operand(null, null, null, null, List.of());

        public static Operand none() {
            return NONE;
        }

        public static Operand field(String doc, String field) {
            return new Operand(doc, field, null, null, List.of());
        }

        public static Operand literal(String value) {
            return new Operand(null, null, value, null, List.of());
        }

        public boolean isLiteral() {
            return literal != null;
        }

        /** Whether it works a value out rather than reading one. */
        public boolean isComputed() {
            return fn != null;
        }

        /** Whether it names a field on a document. */
        public boolean names() {
            return doc != null && field != null;
        }

        /** Whether it reads a field off every document that carries one. */
        public boolean wildcard() {
            return ANY_DOCUMENT.equals(doc);
        }

        public boolean empty() {
            return !isLiteral() && !names() && !isComputed();
        }

        /** Every operand inside this one, itself included, outermost first. */
        public List<Operand> flatten() {
            List<Operand> out = new ArrayList<>();
            out.add(this);
            for (Operand a : args) out.addAll(a.flatten());
            return out;
        }

        /** How it reads before anything is resolved: {@code date_plus(on_board_date, 21)}. */
        public String describe() {
            if (isLiteral()) return literal;
            if (isComputed()) {
                List<String> parts = new ArrayList<>();
                for (Operand a : args) parts.add(a.describe());
                return fn.wire() + "(" + String.join(", ", parts) + ")";
            }
            if (!names()) return "?";
            return (wildcard() ? "every document" : doc) + "." + field;
        }
    }

    /**
     * What came of reading one.
     *
     * <p>Problems rather than an exception: a malformed condition is authored data, and the
     * author is owed a list of what to fix rather than the first thing that threw.
     */
    public record Parsed(ConditionTree tree, List<String> problems) {

        public boolean ok() {
            return tree != null && problems.isEmpty();
        }

        public String why() {
            return String.join("; ", problems);
        }
    }

    public boolean isEmpty() {
        return groups.isEmpty() || groups.stream().allMatch(g -> g.rows().isEmpty());
    }

    /** Every row, in the order the author wrote them, groups flattened away. */
    public List<Row> rows() {
        List<Row> out = new ArrayList<>();
        for (Group g : groups) out.addAll(g.rows());
        return out;
    }

    /**
     * Every document any operand reads, in first-seen order and without repeats.
     *
     * <p>The wildcard is left out: it names no document, and a check declaring it read one
     * called {@code *} would be offered to a presentation that cannot contain it.
     */
    public List<String> documents() {
        List<String> out = new ArrayList<>();
        for (Row r : rows()) {
            for (Operand top : List.of(r.left(), r.right())) {
                for (Operand o : top.flatten()) {
                    if (o.doc() != null && !o.wildcard() && !out.contains(o.doc())) out.add(o.doc());
                }
            }
        }
        return out;
    }

    /**
     * The lowest reader that may evaluate this, worked out from what it actually uses.
     *
     * <p>Computed rather than trusted. An author or a model writing {@code "v": 1} above a
     * function operand would be declaring that a reader which does not know functions may run
     * it, and that reader would drop the operand and compare against nothing. What a tree
     * needs is a property of the tree.
     */
    public int requiredVersion() {
        for (Row r : rows()) {
            for (Operand top : List.of(r.left(), r.right())) {
                for (Operand o : top.flatten()) {
                    if (o.isComputed() || o.wildcard()) return 2;
                }
            }
        }
        return 1;
    }

    // =========================================================================
    // Reading one
    // =========================================================================

    /**
     * Reads a stored condition.
     *
     * @param rule either the whole {@code {"v":1,"scope":…,"groups":[…]}} object or the
     *             {@code groups} array on its own — the check document holds the first and
     *             {@code lc_plan_check.rule_def} the second, and a model asked for one
     *             reliably produces the other
     */
    @SuppressWarnings("unchecked")
    public static Parsed parse(Object rule) {
        List<String> problems = new ArrayList<>();

        Map<String, Object> wrapper = rule instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        Object rawGroups = wrapper.containsKey("groups") ? wrapper.get("groups") : rule;

        int declared = intOf(wrapper.get("v"), 1);
        if (declared > SUPPORTED) {
            // Refused, not downgraded. Every later check here would be reading a shape this
            // build does not know, and the rows it did understand would run and report a
            // comparison that is missing its other half.
            problems.add("this condition needs version " + declared
                    + " and this examination reads version " + SUPPORTED);
            return new Parsed(null, List.copyOf(problems));
        }

        if (!(rawGroups instanceof List<?> list) || list.isEmpty()) {
            problems.add("no conditions");
            return new Parsed(null, List.copyOf(problems));
        }

        List<Group> groups = new ArrayList<>();
        int rowCount = 0;
        for (Object g : list) {
            if (!(g instanceof Map<?, ?> raw)) {
                problems.add("a group that is not a group");
                continue;
            }
            Map<String, Object> group = (Map<String, Object>) raw;
            Object rowList = group.get("rows");
            if (!(rowList instanceof List<?> rl) || rl.isEmpty()) {
                problems.add("a group with no rows");
                continue;
            }
            List<Row> rows = new ArrayList<>();
            for (Object r : rl) {
                if (!(r instanceof Map<?, ?> row)) {
                    problems.add("a row that is not a row");
                    continue;
                }
                rows.add(row((Map<String, Object>) row));
                rowCount++;
            }
            groups.add(new Group(
                    str(group.get("id")),
                    "any".equalsIgnoreCase(String.valueOf(group.getOrDefault("logic", "all"))),
                    "OR".equalsIgnoreCase(String.valueOf(group.getOrDefault("connector", "AND")))
                            ? "OR" : "AND",
                    List.copyOf(rows)));
        }

        if (rowCount == 0) problems.add("no conditions");

        // The floor the content actually asks for, which may be higher than what it claimed.
        // A tree declaring v1 over a function operand is a tree asking an older reader to run
        // half of it.
        ConditionTree tree = new ConditionTree(
                declared, str(wrapper.get("scope")), str(wrapper.get("message")),
                List.copyOf(groups));
        int needed = tree.requiredVersion();
        if (needed > SUPPORTED) {
            problems.add("this condition uses something only version " + needed
                    + " can evaluate, and this examination reads version " + SUPPORTED);
        }
        tree = new ConditionTree(Math.max(declared, needed), tree.scope(), tree.message(),
                tree.groups());
        return new Parsed(problems.isEmpty() ? tree : null, List.copyOf(problems));
    }

    private static Row row(Map<String, Object> row) {
        Operator op = Operator.of(str(row.get("op")));
        return new Row(
                str(row.get("id")),
                op,
                operand(row.get("l")),
                op.unary() ? Operand.none() : operand(row.get("r")),
                row.get("tol") == null ? "" : String.valueOf(row.get("tol")));
    }

    /** Nested functions stop here. Two levels express art. 14(c); ten express nothing extra. */
    private static final int MAX_DEPTH = 3;

    @SuppressWarnings("unchecked")
    private static Operand operand(Object side) {
        return operand(side, 0);
    }

    @SuppressWarnings("unchecked")
    private static Operand operand(Object side, int depth) {
        if (!(side instanceof Map<?, ?> m) || depth > MAX_DEPTH) return Operand.none();
        Map<String, Object> o = (Map<String, Object>) m;

        // A blank literal is not a literal. The console writes `{"literal": ""}` into the
        // right-hand side of a unary row, and reading that as "compare against the empty
        // string" turned `present` into a comparison nobody wrote.
        String literal = str(o.get("literal"));
        if (literal != null) return Operand.literal(literal);

        if (o.get("expr") instanceof Map<?, ?> raw) {
            Map<String, Object> expr = (Map<String, Object>) raw;
            ConditionFn fn = ConditionFn.of(str(expr.get("fn")));
            List<Operand> args = new ArrayList<>();
            if (expr.get("args") instanceof List<?> list) {
                for (Object a : list) args.add(operand(a, depth + 1));
            }
            // An unknown name yields an operand with no fn, which `empty()` reports and the
            // compiler rejects by name. Guessing at the nearest function is how a rule comes
            // to compute something nobody asked for.
            return new Operand(null, null, null, fn, List.copyOf(args));
        }

        return Operand.field(str(o.get("doc")), str(o.get("field")));
    }

    // =========================================================================
    // Writing one back
    // =========================================================================

    /**
     * The tree as it is stored, for a caller that has to hand it to a serialiser.
     *
     * <p>Round-trips: {@code parse(toMap(parse(x).tree()))} is the same tree. That is the
     * property the plan screen and the finding both depend on, and it is why the flattener
     * they used to share lives here now.
     */
    public Map<String, Object> toMap() {
        List<Object> out = new ArrayList<>();
        for (Group g : groups) {
            List<Object> rows = new ArrayList<>();
            for (Row r : g.rows()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", r.id());
                row.put("op", r.op().wire());
                row.put("tol", r.tol());
                row.put("l", side(r.left()));
                if (!r.op().unary()) row.put("r", side(r.right()));
                rows.add(row);
            }
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("id", g.id());
            group.put("logic", g.any() ? "any" : "all");
            group.put("connector", g.connector());
            group.put("rows", rows);
            out.add(group);
        }
        Map<String, Object> tree = new LinkedHashMap<>();
        tree.put("v", version);
        if (scope != null) tree.put("scope", scope);
        if (message != null) tree.put("message", message);
        tree.put("groups", out);
        return tree;
    }

    private static Map<String, Object> side(Operand o) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (o.isLiteral()) {
            out.put("literal", o.literal());
        } else if (o.isComputed()) {
            Map<String, Object> expr = new LinkedHashMap<>();
            expr.put("fn", o.fn().wire());
            List<Object> args = new ArrayList<>();
            for (Operand a : o.args()) args.add(side(a));
            expr.put("args", args);
            out.put("expr", expr);
        } else {
            out.put("doc", o.doc());
            out.put("field", o.field());
        }
        return out;
    }

    private static int intOf(Object o, int fallback) {
        if (o instanceof Number n) return n.intValue();
        try {
            return o == null ? fallback : Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).strip();
        return s.isEmpty() ? null : s;
    }
}
