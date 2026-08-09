package com.tb.helix.harness.expr;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.expression.EvaluationException;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.SpelNode;
import org.springframework.expression.spel.SpelParserConfiguration;
import org.springframework.expression.spel.SpelCompilerMode;
import org.springframework.expression.spel.ast.*;
import org.springframework.expression.spel.standard.SpelExpression;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.SimpleEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The engine. Spring parses and Spring evaluates; what is ours is everything around that.
 *
 * <p>Spring's expression language is used for what it is good at — a grammar, a parser, an
 * abstract tree, and operators that already know how to compare a {@code LocalDate} with a
 * {@code LocalDate}. What it is not used for is deciding <em>what</em> may appear in an
 * expression, or what to do when a value is missing, because its answers to both are wrong
 * here: it reaches static methods and the bean factory unless stopped, and its comparator
 * treats {@code null} as less than everything.
 *
 * <p>So three things are held back from it. <b>The whitelist</b>, which decides what parses at
 * all. <b>Absence</b>, which never reaches it — a leaf with an unbound name is not evaluated.
 * And <b>the and/or above the leaves</b>, evaluated here over three values instead of two.
 *
 * @see <a href="file:package-info.java">the package's own note</a> for why each of those is
 *      not a matter of taste
 */
@Component
public class SpelExpressionEngine implements ExpressionEngine {

    private static final Logger log = LoggerFactory.getLogger(SpelExpressionEngine.class);

    /** {@code {DOC.field}} or {@code {anything.sensible}} — the name is not ours to judge. */
    private static final Pattern PLACEHOLDER =
            Pattern.compile("\\{\\s*([A-Za-z*][A-Za-z0-9_*]*(?:\\.[A-Za-z0-9_]+)*)\\s*}");

    static final int MAX_SOURCE = 800;
    private static final int MAX_DEPTH = 32;
    private static final int MAX_NODES = 200;
    private static final int MAX_SLOTS = 24;

    /**
     * Never compile to bytecode, never grow a null into an object, and refuse a source longer
     * than we are prepared to reason about. The last argument is the one that matters least
     * and is checked first anyway; the two {@code false}s are the ones that would otherwise
     * turn a read into a write.
     */
    private final SpelExpressionParser parser = new SpelExpressionParser(
            new SpelParserConfiguration(SpelCompilerMode.OFF, null, false, false, 0, MAX_SOURCE));

    private final Map<String, VerbSpec> verbs = new LinkedHashMap<>();
    private final Map<String, MethodHandle> handles = new LinkedHashMap<>();
    private final Map<String, ExprProgram> compiled = new ConcurrentHashMap<>();

    public SpelExpressionEngine(List<VerbSpec> contributed) {
        for (VerbSpec v : Verbs.standard()) register(v);
        // Registered after, so a module that knows better about a name may take it over —
        // and loudly, because two modules quietly claiming one verb is how an expression
        // comes to mean different things in two places.
        for (VerbSpec v : contributed) {
            if (verbs.containsKey(v.name())) {
                log.warn("Verb #{} is being redefined by a contributed spec", v.name());
            }
            register(v);
        }
    }

    private void register(VerbSpec v) {
        verbs.put(v.name(), v);
        handles.put(v.name(), MethodHandles.insertArguments(DISPATCH, 0, v)
                .asVarargsCollector(Object[].class));
    }

    // Spring calls a function through a Method or a MethodHandle, and a VerbSpec carries a
    // lambda. One static dispatcher, bound to the spec and made variadic, bridges the two —
    // which is what lets a verb be contributed by a module rather than declared as a method
    // on a class this package would then have to know about.
    private static final MethodHandle DISPATCH;

    static {
        try {
            DISPATCH = MethodHandles.lookup().findStatic(SpelExpressionEngine.class, "invoke",
                    MethodType.methodType(Object.class, VerbSpec.class, Object[].class));
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    /**
     * Whether a verb in the leaf being evaluated could not answer.
     *
     * <p>A second door into the same danger the unbound-name check guards, and it has to be
     * closed separately. {@code #daysBetween('not a date', x)} returns nothing, and
     * {@code nothing > 21} is not an error to Spring — its comparator ranks null below every
     * value, so the leaf comes back FALSE. A discrepancy, raised confidently, because a date
     * would not parse.
     *
     * <p>Set by the dispatcher rather than found by walking the tree, so it catches a verb at
     * any depth and any nesting without this class having to predict where one might sit.
     * Per-thread because leaves are settled one at a time on whichever thread is running the
     * case, and cleared before each.
     */
    private static final ThreadLocal<boolean[]> UNANSWERED = ThreadLocal.withInitial(() -> new boolean[1]);

    @SuppressWarnings("unused")   // reached by MethodHandle, not by name
    private static Object invoke(VerbSpec spec, Object[] args) {
        Object out = spec.fn().apply(Arrays.asList(args));
        if (out == null) UNANSWERED.get()[0] = true;
        return out;
    }

    // =========================================================================
    // Compiling
    // =========================================================================

    @Override
    public ExprProgram compile(String source) {
        return compiled.computeIfAbsent(source == null ? "" : source, this::build);
    }

    private ExprProgram build(String source) {
        List<String> problems = new ArrayList<>();
        if (source.isBlank()) return ExprProgram.broken(source, List.of("there is no condition here"));
        if (source.length() > MAX_SOURCE) {
            return ExprProgram.broken(source,
                    List.of("this condition is " + source.length() + " characters, and "
                            + MAX_SOURCE + " is the most that can be checked"));
        }

        Rewritten r = rewrite(source, problems);
        if (!problems.isEmpty()) return ExprProgram.broken(source, problems);

        SpelNode ast;
        try {
            ast = ((SpelExpression) parser.parseExpression(r.text())).getAST();
        } catch (RuntimeException e) {
            // The parser's own message, cleaned of the rewritten text — an author who wrote
            // {LC.expiry} should not be shown a complaint about #p0.
            return ExprProgram.broken(source,
                    List.of("this could not be read as a condition: " + restore(short_(e.getMessage()), r)));
        }

        Whitelist.check(ast, r.slots(), verbs, problems);
        if (!problems.isEmpty()) return ExprProgram.broken(source, problems);

        List<ExprProgram.Leaf> leaves = new ArrayList<>();
        ExprProgram.Skeleton skeleton = shape(ast, r, leaves, problems);
        if (!problems.isEmpty()) return ExprProgram.broken(source, problems);

        return new ExprProgram(source, r.reads(), leaves, skeleton, List.of());
    }

    /** The source with every {@code {name}} replaced by a variable, and where each one was. */
    private record Rewritten(String text, List<ExprProgram.Read> reads, Map<String, Integer> slots) {

        String nameOf(int slot) {
            return reads.stream().filter(x -> x.slot() == slot).map(ExprProgram.Read::name)
                    .findFirst().orElse("?");
        }
    }

    private Rewritten rewrite(String source, List<String> problems) {
        Map<String, Integer> slots = new LinkedHashMap<>();
        List<ExprProgram.Read> reads = new ArrayList<>();
        StringBuilder out = new StringBuilder();

        Matcher m = PLACEHOLDER.matcher(source);
        int at = 0;
        while (m.find()) {
            String name = m.group(1);
            int slot = slots.computeIfAbsent(name, k -> slots.size());
            reads.add(new ExprProgram.Read(slot, name, m.start(), m.end()));
            out.append(source, at, m.start()).append("#p").append(slot);
            at = m.end();
        }
        out.append(source, at, source.length());

        // Anything brace-shaped that survived is either a typo or Spring's inline list
        // literal, and both have to be caught here: {1,2} reaching the parser is a real
        // collection, and the grammar has no business holding one.
        String rest = out.toString();
        if (rest.indexOf('{') >= 0 || rest.indexOf('}') >= 0) {
            problems.add("every {…} must name something to read, as {LC.expiry_date}");
        }
        if (slots.size() > MAX_SLOTS) {
            problems.add("this condition reads " + slots.size()
                    + " different things, and " + MAX_SLOTS + " is the most it may");
        }
        return new Rewritten(rest, reads, slots);
    }

    // =========================================================================
    // Leaves, and the shape above them
    // =========================================================================

    /**
     * Split the tree into comparisons and the and/or that joins them.
     *
     * <p>A leaf is a relational node or a boolean verb call: the smallest thing that can be
     * true or false on its own, and therefore the smallest thing worth showing an officer as
     * a row. Everything above the leaves is a connective, and there are only two.
     */
    private ExprProgram.Skeleton shape(SpelNode node, Rewritten r,
                                       List<ExprProgram.Leaf> leaves, List<String> problems) {
        if (node instanceof OpAnd || node instanceof OpOr) {
            List<ExprProgram.Skeleton> parts = new ArrayList<>();
            for (int i = 0; i < node.getChildCount(); i++) {
                ExprProgram.Skeleton s = shape(node.getChild(i), r, leaves, problems);
                if (s == null) return null;
                parts.add(s);
            }
            return node instanceof OpAnd ? new ExprProgram.All(parts) : new ExprProgram.Any(parts);
        }

        String ast = node.toStringAST();
        String op = opOf(node);
        if (op == null) {
            problems.add("\"" + restore(ast, r) + "\" is not a comparison, so nothing about it "
                    + "is true or false");
            return null;
        }
        List<String> names = new ArrayList<>();
        namesIn(node, r, names);
        int index = leaves.size();
        leaves.add(new ExprProgram.Leaf(index, restore(strip(ast), r), op, names));
        return new ExprProgram.Ref(index);
    }

    /** What a leaf compares with, for the evidence row. Null when it settles nothing. */
    private String opOf(SpelNode node) {
        if (node instanceof OpEQ) return "==";
        if (node instanceof OpNE) return "!=";
        if (node instanceof OpLT) return "<";
        if (node instanceof OpGT) return ">";
        if (node instanceof OpLE) return "<=";
        if (node instanceof OpGE) return ">=";
        if (node instanceof FunctionReference f) {
            VerbSpec v = verbs.get(nameOfFunction(f));
            return v != null && v.returns() == VerbSpec.Returns.BOOLEAN ? v.name() : null;
        }
        return null;
    }

    private void namesIn(SpelNode node, Rewritten r, List<String> out) {
        if (node instanceof VariableReference v) {
            Integer slot = slotOf(v);
            if (slot != null) {
                String name = r.nameOf(slot);
                if (!out.contains(name)) out.add(name);
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) namesIn(node.getChild(i), r, out);
    }

    // =========================================================================
    // Running
    // =========================================================================

    @Override
    public ExprResult run(String source, Map<String, Object> values) {
        ExprProgram p = compile(source);
        if (!p.ok()) return ExprResult.broken(p.problems());

        SimpleEvaluationContext ctx = context(p, values);

        List<ExprResult.LeafResult> results = new ArrayList<>();
        List<ExprResult.Verdict> outcomes = new ArrayList<>();
        for (ExprProgram.Leaf leaf : p.leaves()) {
            ExprResult.LeafResult one = settle(leaf, p, values, ctx);
            results.add(one);
            outcomes.add(one.outcome());
        }

        ExprResult.Verdict verdict = fold(p.skeleton(), outcomes);
        // Which leaf decided it, asked rather than guessed at. Under `or` the first false leaf
        // is often the one that did not matter, and dimming the row that did is worse than
        // marking none.
        List<ExprResult.LeafResult> marked = new ArrayList<>();
        for (ExprResult.LeafResult one : results) {
            marked.add(new ExprResult.LeafResult(one.index(), one.source(), one.op(),
                    one.outcome(), one.operands(), decisive(p, outcomes, one.index(), verdict),
                    one.why()));
        }
        return new ExprResult(verdict, marked, reading(p, values), List.of());
    }

    /**
     * Values in, nothing out.
     *
     * <p>{@code SimpleEvaluationContext} and never the standard one: no bean resolver, no type
     * locator, no method resolvers. No root object is set, so there is no object to navigate
     * from, and instance methods are deliberately not enabled. Values arrive as variables the
     * rewrite minted, which is why no name in a valid expression is one an author chose.
     */
    private SimpleEvaluationContext context(ExprProgram p, Map<String, Object> values) {
        SimpleEvaluationContext ctx = SimpleEvaluationContext.forReadOnlyDataBinding().build();
        for (ExprProgram.Read read : p.reads()) {
            Object v = values.get(read.name());
            if (v != null) ctx.setVariable("p" + read.slot(), v);
        }
        handles.forEach(ctx::setVariable);
        return ctx;
    }

    /**
     * One comparison, settled by Spring — or not attempted at all.
     *
     * <p>An unbound name short-circuits before evaluation, and that ordering is the whole
     * safety property: {@code StandardTypeComparator} ranks {@code null} below every value, so
     * an unread date handed to {@code >} would come back confidently and wrongly. The presence
     * verbs are the exception and say so, because for them the absence <em>is</em> the answer.
     */
    private ExprResult.LeafResult settle(ExprProgram.Leaf leaf, ExprProgram p,
                                         Map<String, Object> values, SimpleEvaluationContext ctx) {
        List<ExprResult.Operand> operands = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (String name : leaf.names()) {
            Object v = values.get(name);
            operands.add(new ExprResult.Operand(name, v, v != null));
            if (v == null) missing.add(name);
        }

        boolean presence = "present".equals(leaf.op()) || "absent".equals(leaf.op());
        if (!missing.isEmpty() && !presence) {
            return new ExprResult.LeafResult(leaf.index(), leaf.source(), leaf.op(),
                    ExprResult.Verdict.UNKNOWN, operands, false,
                    (missing.size() == 1 ? missing.get(0) + " was not read"
                            : String.join(" and ", missing) + " were not read")
                            + ", so this comparison could not be made");
        }

        UNANSWERED.get()[0] = false;
        try {
            Expression e = parser.parseExpression(rewriteFor(leaf, p));
            Object answer = e.getValue(ctx);
            // Asked AFTER the evaluation and before the answer is believed. A verb that
            // returned nothing has already been folded into whatever Spring compared next,
            // and that comparison's answer is about a null rather than about the documents.
            if (UNANSWERED.get()[0]) {
                return unusable(leaf, operands,
                        "something here could not be worked out from what was read");
            }
            if (answer instanceof Boolean b) {
                // No `why` either way. It said "this did not hold", which is the outcome
                // restated in a second vocabulary — and once the outcome is rendered as
                // Clean / Doubt / Discrepancy the two sat side by side contradicting each
                // other. `why` is for what the outcome CANNOT say: which value was missing,
                // and whose gap it is.
                return new ExprResult.LeafResult(leaf.index(), leaf.source(), leaf.op(),
                        b ? ExprResult.Verdict.TRUE : ExprResult.Verdict.FALSE, operands, false,
                        null);
            }
            return unusable(leaf, operands, "this could not be settled from what was read");
        } catch (EvaluationException e) {
            // Belt and braces over the short-circuit above: anything that still reaches Spring
            // and throws degrades to "could not be answered", never to a discrepancy.
            return unusable(leaf, operands, "this could not be worked out: " + short_(e.getMessage()));
        }
    }

    private static ExprResult.LeafResult unusable(ExprProgram.Leaf leaf,
                                                  List<ExprResult.Operand> operands, String why) {
        return new ExprResult.LeafResult(leaf.index(), leaf.source(), leaf.op(),
                ExprResult.Verdict.UNKNOWN, operands, false, why);
    }

    /** The leaf's own source, back in the variable form Spring parses. */
    private String rewriteFor(ExprProgram.Leaf leaf, ExprProgram p) {
        String text = leaf.source();
        // Longest first, so {LC.expiry} is not eaten by a name that is its prefix.
        List<ExprProgram.Read> byLength = new ArrayList<>(p.reads());
        byLength.sort((a, b) -> b.name().length() - a.name().length());
        for (ExprProgram.Read read : byLength) {
            text = text.replace("{" + read.name() + "}", "#p" + read.slot());
        }
        return text;
    }

    // =========================================================================
    // Three-valued logic, and why it is exact
    // =========================================================================

    /**
     * The skeleton, twice: unknowns forced true, then forced false.
     *
     * <p>Agreement means the answer was forced by the leaves that <em>did</em> settle, and
     * disagreement means it was not. That is exact rather than conservative — but only because
     * the grammar refuses negation. With {@code !} in the language, {@code A and !B} with both
     * unknown returns false on both runs and would be reported as a definite failure, when
     * {@code A=true, B=false} makes it true: a discrepancy raised on a presentation where
     * nothing was read.
     */
    private static ExprResult.Verdict fold(ExprProgram.Skeleton s, List<ExprResult.Verdict> leaves) {
        boolean optimistic = walk(s, leaves, true);
        boolean pessimistic = walk(s, leaves, false);
        return optimistic == pessimistic
                ? (optimistic ? ExprResult.Verdict.TRUE : ExprResult.Verdict.FALSE)
                : ExprResult.Verdict.UNKNOWN;
    }

    private static boolean walk(ExprProgram.Skeleton s, List<ExprResult.Verdict> leaves, boolean unknownIs) {
        if (s instanceof ExprProgram.Ref r) {
            ExprResult.Verdict v = leaves.get(r.leaf());
            return v == ExprResult.Verdict.UNKNOWN ? unknownIs : v == ExprResult.Verdict.TRUE;
        }
        if (s instanceof ExprProgram.All a) {
            for (ExprProgram.Skeleton part : a.parts()) if (!walk(part, leaves, unknownIs)) return false;
            return true;
        }
        ExprProgram.Any any = (ExprProgram.Any) s;
        for (ExprProgram.Skeleton part : any.parts()) if (walk(part, leaves, unknownIs)) return true;
        return false;
    }

    /** Whether flipping this leaf would change the answer. */
    private static boolean decisive(ExprProgram p, List<ExprResult.Verdict> outcomes,
                                    int index, ExprResult.Verdict verdict) {
        if (outcomes.get(index) == ExprResult.Verdict.UNKNOWN) return false;
        List<ExprResult.Verdict> flipped = new ArrayList<>(outcomes);
        flipped.set(index, outcomes.get(index) == ExprResult.Verdict.TRUE
                ? ExprResult.Verdict.FALSE : ExprResult.Verdict.TRUE);
        return fold(p.skeleton(), flipped) != verdict;
    }

    // =========================================================================
    // Saying it back
    // =========================================================================

    /** The expression as authored, with each name replaced by what was read for it. */
    private static String reading(ExprProgram p, Map<String, Object> values) {
        StringBuilder sb = new StringBuilder();
        int at = 0;
        List<ExprProgram.Read> inOrder = new ArrayList<>(p.reads());
        inOrder.sort(Comparator.comparingInt(ExprProgram.Read::from));
        for (ExprProgram.Read read : inOrder) {
            if (read.from() < at) continue;
            Object v = values.get(read.name());
            sb.append(p.source(), at, read.from())
              // Values.show, not String.valueOf: a LocalDate prints itself with dashes, and
              // one of the four places that render a bound value keeping that form is how a
              // screen comes to show two date formats.
              .append(v == null ? "— not read —" : Values.show(v));
            at = read.to();
        }
        sb.append(p.source(), at, p.source().length());
        return sb.toString();
    }

    private static Integer slotOf(VariableReference v) {
        String ast = v.toStringAST();          // "#p3"
        if (!ast.startsWith("#p")) return null;
        try {
            return Integer.valueOf(ast.substring(2));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String nameOfFunction(FunctionReference f) {
        String ast = f.toStringAST();           // "#same(#p0,#p1)"
        int open = ast.indexOf('(');
        return open < 0 ? ast.substring(1) : ast.substring(1, open);
    }

    /** {@code #p0 > #p1} back to {@code {LC.a} > {LC.b}}, for anything a person will read. */
    private static String restore(String text, Rewritten r) {
        if (text == null) return "";
        String out = text;
        // Highest slot first: #p1 must not be rewritten by the rule for #p10.
        List<Map.Entry<String, Integer>> bySlot = new ArrayList<>(r.slots().entrySet());
        bySlot.sort((a, b) -> b.getValue() - a.getValue());
        for (Map.Entry<String, Integer> e : bySlot) {
            out = out.replace("#p" + e.getValue(), "{" + e.getKey() + "}");
        }
        return out;
    }

    private static String strip(String ast) {
        String s = ast.strip();
        return s.startsWith("(") && s.endsWith(")") ? s.substring(1, s.length() - 1) : s;
    }

    private static String short_(String message) {
        if (message == null) return "";
        String one = message.replaceAll("\\s+", " ").strip();
        return one.length() > 160 ? one.substring(0, 160) + "…" : one;
    }

    // =========================================================================
    // What the language is
    // =========================================================================

    @Override
    public List<VerbSpec> verbs() {
        return List.copyOf(verbs.values());
    }

    @Override
    public String grammar() {
        StringBuilder sb = new StringBuilder("""
                A condition says WHAT MUST BE TRUE, and it holds or it does not.

                Write the compliant state, never the fault. "Shipment on or before the
                latest shipment date" is {BOL.on_board_date} <= {LC.latest_shipment_date};
                writing `>` there would say that late shipment is what the credit requires,
                and the check would report every compliant presentation as a discrepancy —
                a mistake nothing downstream can notice, because the condition held.

                  {NAME}            a value to be read. Everything else is a literal.
                  > < >= <= == !=   compare two values
                  and  or           join comparisons. There is no `not`.
                  #verb(a, b)       one of the verbs below, and nothing else

                Absence is not falsehood. A comparison reading something that was not read
                is not false — it cannot be answered, and the condition only settles if the
                rest of it forces an answer either way.

                There is no `not`, no `a ? b : c` and no `a ?: b`, and that is not an
                omission. Every one of them can turn "nothing was read" into a confident
                answer, and each has a verb below that says the same thing safely.

                VERBS
                """);
        for (VerbSpec v : verbs.values()) {
            sb.append("  #").append(v.name())
              .append(v.arity() < 0 ? "(a, b, …)" : "(" + args(v.arity()) + ")")
              .append(v.returns() == VerbSpec.Returns.BOOLEAN ? "  — " : "  = ")
              .append(v.about()).append('\n');
        }
        return sb.toString();
    }

    private static String args(int n) {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < n; i++) names.add(String.valueOf((char) ('a' + i)));
        return String.join(", ", names);
    }

    static int maxDepth() {
        return MAX_DEPTH;
    }

    static int maxNodes() {
        return MAX_NODES;
    }
}
