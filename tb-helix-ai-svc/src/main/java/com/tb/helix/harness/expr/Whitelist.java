package com.tb.helix.harness.expr;

import org.springframework.expression.spel.SpelNode;
import org.springframework.expression.spel.ast.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What may appear in an expression. An allow list, and never a deny list.
 *
 * <p>The difference decides which way this fails. An allow list meets a construct it has never
 * heard of and refuses it; a deny list meets one and permits it. Spring's expression language
 * gains nodes between versions, and one of them reaching a string a model wrote is the failure
 * this class exists to make impossible.
 *
 * <p><b>What is being kept out.</b> {@code T(java.lang.Runtime).getRuntime().exec(…)} is the
 * textbook remote code execution in this language, and it is one node type away from every
 * other property navigation. So type references go, and with them bean references,
 * constructors, method invocation, and — less obviously but just as necessarily — plain
 * property navigation: after the rewrite there is no legitimate bare identifier, and
 * {@code a.b.c} is the head of every gadget chain there has ever been.
 *
 * <p><b>What is being kept out for a different reason.</b> Negation, boolean inequality, the
 * ternary and elvis are all perfectly safe and all refused, because the three-valued logic
 * above the leaves is only exact while the formula is monotone. See the fold in
 * {@link SpelExpressionEngine}: with {@code !} in the language, two unknown leaves can produce
 * a confident wrong answer, and a discrepancy raised on a presentation where nothing was read
 * is the worst thing this system can do.
 */
final class Whitelist {

    private Whitelist() {
    }

    /**
     * Node types an expression may contain.
     *
     * <p>Arithmetic is here because a caller binds real {@code BigDecimal}s and Spring's
     * {@code OpPlus} takes the exact path for them — money added as a double is a different
     * kind of wrong from the ones above, and just as unwelcome.
     */
    private static final Set<Class<?>> ALLOWED = Set.of(
            OpAnd.class, OpOr.class,
            OpEQ.class, OpNE.class, OpLT.class, OpGT.class, OpLE.class, OpGE.class,
            OpPlus.class, OpMinus.class, OpMultiply.class, OpDivide.class,
            FunctionReference.class, VariableReference.class,
            StringLiteral.class, IntLiteral.class, LongLiteral.class,
            RealLiteral.class, FloatLiteral.class, BooleanLiteral.class);

    /** Why each refused construct is refused, in words an author can act on. */
    private static final Map<Class<?>, String> REFUSED = Map.ofEntries(
            Map.entry(TypeReference.class, "a T(…) type reference, which can reach any class on the server"),
            Map.entry(BeanReference.class, "an @bean reference, which can reach the application itself"),
            Map.entry(ConstructorReference.class, "a `new`, which builds objects a condition has no use for"),
            Map.entry(MethodReference.class, "a method call, which can reach anything the object can"),
            Map.entry(PropertyOrFieldReference.class, "a bare name — everything read must be written {like.this}"),
            Map.entry(CompoundExpression.class, "a `.` navigation, which can reach anything the value can"),
            Map.entry(Indexer.class, "an [index], which can reach anything the value can"),
            Map.entry(Projection.class, "a .![…] projection, which evaluates something for every element"),
            Map.entry(Selection.class, "a .?[…] selection, which evaluates something for every element"),
            Map.entry(Assign.class, "an assignment — a condition asks, it does not change anything"),
            Map.entry(OpInc.class, "an increment — a condition asks, it does not change anything"),
            Map.entry(OpDec.class, "a decrement — a condition asks, it does not change anything"),
            Map.entry(InlineList.class, "a {…} list, which collides with the way values are named"),
            Map.entry(InlineMap.class, "a {…} map, which collides with the way values are named"),
            Map.entry(Ternary.class, "an a ? b : c, which can turn \"not read\" into a confident answer"),
            Map.entry(Elvis.class, "an a ?: b, which can turn \"not read\" into a confident answer"),
            Map.entry(OperatorNot.class, "a `not`. Use the opposite verb or comparison instead — "
                    + "with negation, two things that were not read can produce a confident wrong answer"),
            Map.entry(OperatorMatches.class, "the `matches` operator. Use #matches, which guards the pattern"),
            Map.entry(OperatorInstanceof.class, "an `instanceof`, which has no meaning here"),
            Map.entry(OperatorBetween.class, "a `between`, which has no meaning here"),
            Map.entry(OperatorPower.class, "a power, which has no meaning here"),
            Map.entry(OpModulus.class, "a modulus, which has no meaning here"),
            Map.entry(NullLiteral.class, "a `null`. Something that was not read is not null — "
                    + "use #absent to ask whether it was read"));

    static void check(SpelNode root, Map<String, Integer> slots, Map<String, VerbSpec> verbs,
                      List<String> problems) {
        int[] counted = {0};
        walk(root, slots, verbs, problems, 0, counted);
    }

    private static void walk(SpelNode node, Map<String, Integer> slots, Map<String, VerbSpec> verbs,
                             List<String> problems, int depth, int[] counted) {
        if (!problems.isEmpty()) return;      // one clear problem beats twenty consequential ones
        if (depth > SpelExpressionEngine.maxDepth()) {
            problems.add("this condition nests deeper than " + SpelExpressionEngine.maxDepth()
                    + " levels, which is deeper than it can be checked");
            return;
        }
        if (++counted[0] > SpelExpressionEngine.maxNodes()) {
            problems.add("this condition has more parts than " + SpelExpressionEngine.maxNodes()
                    + ", which is more than it can be checked");
            return;
        }

        Class<?> type = node.getClass();
        if (!ALLOWED.contains(type)) {
            String why = REFUSED.get(type);
            problems.add(why != null
                    ? "this condition uses " + why
                    // The allow list met something it has never heard of. Refusing is the
                    // safe direction and the reason it is an allow list.
                    : "this condition uses something the checker does not recognise ("
                            + type.getSimpleName() + ")");
            return;
        }

        if (node instanceof VariableReference v) {
            String ast = v.toStringAST();
            if (!ast.startsWith("#p") || !slots.containsValue(slotOrMinus(ast))) {
                problems.add("\"" + ast + "\" is not something this condition reads");
                return;
            }
        }
        if (node instanceof FunctionReference f) {
            String name = SpelExpressionEngine.nameOfFunction(f);
            VerbSpec verb = verbs.get(name);
            if (verb == null) {
                problems.add("#" + name + " is not a verb this checker has");
                return;
            }
            if (!verb.accepts(node.getChildCount())) {
                problems.add(verb.arityComplaint(node.getChildCount()));
                return;
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            walk(node.getChild(i), slots, verbs, problems, depth + 1, counted);
        }
    }

    private static int slotOrMinus(String ast) {
        try {
            return Integer.parseInt(ast.substring(2));
        } catch (RuntimeException e) {
            return -1;
        }
    }
}
