package com.tb.helix.lccheck.stage.plan;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.types.ConditionFn;
import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.governance.types.Operator;
import com.tb.helix.lccheck.service.DocumentTypes;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Turning a condition the planner wrote into one the examination can actually settle.
 *
 * <p>Most of what a credit demands in {@code :46A:} and {@code :47A:} is a comparison, not a
 * reading. "Invoice must show the credit number", "beneficiary's name on every document to
 * agree with field 59", "draft drawn at 90 days sight" — each of those is two fields and an
 * operator, and {@code RuleEvaluator} has run exactly that shape since the console started
 * authoring it. Left as prose they cost a model call apiece and come back as an opinion.
 *
 * <p>So the planner is given the vocabulary and asked to compile where it can. This class is
 * the customs post, and it checks two different things in two passes:
 *
 * <ol>
 *   <li><b>Shape</b> — delegated to {@link ConditionTree}, which is what the console writes
 *       and what the evaluator walks. Nothing is re-stated here.
 *   <li><b>Vocabulary</b> — whether the operands name something this bank actually reads.
 *       No schema can answer that; it is the dictionary's to answer, and it is the half that
 *       matters.
 * </ol>
 *
 * <p><b>A rule that does not validate does not become an exact check</b> — the card is
 * demoted to judged and the reason recorded, because the one outcome that must never happen
 * is an invented comparison reported to an officer as deterministic. Three ways a compiled
 * rule is rejected, and all three are things a model does:
 *
 * <ul>
 *   <li>an operator nobody implements, or one of the four that are judgements wearing an
 *       operator's clothes ({@code noconflict}, {@code same_party}, …). Authoring those is
 *       legitimate in the console, where falling through to a judge is the point; here it
 *       means the planner claimed determinism it has not got.
 *   <li>a document code outside the dictionary — the comparison would read a document that
 *       does not exist and return INCONCLUSIVE forever.
 *   <li>a field key nothing extracts off that document. Same outcome, harder to spot,
 *       because the code is real. {@code helix_gov.v_dangling_reference} reports the same
 *       mistake in a rule a person authored, where it is reported rather than refused.
 * </ul>
 *
 * <p>The vocabulary it validates against is also the vocabulary it hands the planner
 * ({@link #vocabulary()}), so the two cannot drift: a field added to the dictionary is
 * offerable and acceptable in the same breath.
 */
@Component
public class RuleCompiler {

    /** Why a compiled rule was not accepted, or empty when it was. */
    public record Verdict(Object rule, List<String> problems) {

        public boolean ok() {
            return rule != null && problems.isEmpty();
        }

        public String why() {
            return String.join("; ", problems);
        }
    }

    private final CheckCatalog catalog;
    private final DocumentTypes docTypes;

    public RuleCompiler(CheckCatalog catalog, DocumentTypes docTypes) {
        this.catalog = catalog;
        this.docTypes = docTypes;
    }

    /**
     * Validates a rule the planner wrote, returning what to store.
     *
     * <p>What comes back is the whole tree rather than its {@code groups}, version included.
     * A stored condition that did not say which reader it needs is one a later build has to
     * guess at, and the guess that runs the half it understands is the dangerous one.
     *
     * @param rule what came back — either the whole {@code {"groups": [...]}} object or the
     *             array itself, because a model asked for one reliably produces the other
     */
    public Verdict compile(Object rule) {
        ConditionTree.Parsed parsed = ConditionTree.parse(rule);
        if (!parsed.ok()) {
            return new Verdict(null, parsed.problems());
        }

        List<String> problems = new ArrayList<>();
        for (ConditionTree.Row row : parsed.tree().rows()) check(row, problems);

        return new Verdict(problems.isEmpty() ? parsed.tree().toMap() : null, List.copyOf(problems));
    }

    private void check(ConditionTree.Row row, List<String> problems) {
        Operator op = row.op();
        if (op == Operator.UNKNOWN) {
            problems.add("that is not an operator this examination knows");
            return;
        }
        // The four judgement operators are honest in the console and dishonest here. An
        // author choosing `noconflict` is asking for a reading; a planner choosing it is
        // labelling a reading as a comparison.
        if (op.needsJudgement()) {
            problems.add("\"" + op.wire() + "\" is a reading rather than a comparison");
            return;
        }

        // Both sides ranging over every document is a cross product nobody authored and
        // nobody could read. Caught here rather than silently taking the left, so a planner
        // that writes it is told rather than half-obeyed.
        if (row.left().wildcard() && row.right().wildcard()) {
            problems.add("both sides read every document, which compares nothing to nothing");
            return;
        }

        operand(row.left(), "left", problems);
        // A literal right-hand side is how a credit's own value gets into a comparison —
        // "shows LC-2024-0031". It names no document, so there is nothing to resolve.
        if (!op.unary() && !row.right().isLiteral()) {
            operand(row.right(), "right", problems);
        }
    }

    private void operand(ConditionTree.Operand operand, String side, List<String> problems) {
        if (operand.isLiteral()) return;

        if (operand.isComputed()) {
            compute(operand, side, problems);
            return;
        }

        if (!operand.names()) {
            problems.add("the " + side + " side names no document and field");
            return;
        }

        // Ranging over the presentation. There is no document to check it against — that is
        // the point — so what is checked is that the field is one somebody reads off
        // something, since a wildcard over a field nothing extracts matches nothing for ever
        // and looks exactly like a check that ran.
        if (operand.wildcard()) {
            if (documentsBinding(operand.field()).isEmpty()) {
                problems.add(operand.field() + " is not read from any document, so reading it "
                        + "off every document reads it off none");
            }
            return;
        }

        if (!docTypes.known(operand.doc())) {
            problems.add(operand.doc() + " is not a document type in the dictionary");
            return;
        }
        if (!fieldsOf(operand.doc()).contains(operand.field())) {
            problems.add(operand.field() + " is not read from " + operand.doc());
        }
    }

    /**
     * A value the condition works out, checked before it is trusted to work anything out.
     *
     * <p>The name and the count, then every argument by the same rules — an argument is an
     * operand, so {@code date_plus(BOL.on_board_date, 21)} is checked exactly as the two
     * operands it is made of.
     */
    private void compute(ConditionTree.Operand operand, String side, List<String> problems) {
        ConditionFn fn = operand.fn();
        if (fn == null) {
            problems.add("the " + side + " side computes something with a function this "
                    + "examination does not have");
            return;
        }
        if (!fn.accepts(operand.args().size())) {
            problems.add(fn.arityComplaint(operand.args().size()));
            return;
        }
        for (ConditionTree.Operand arg : operand.args()) {
            operand(arg, side, problems);
        }
    }

    /** Every document the dictionary says one field is readable from. */
    private Set<String> documentsBinding(String fieldKey) {
        Set<String> docs = new LinkedHashSet<>();
        if (fieldKey == null) return docs;
        for (CheckCatalog.DocTypeDef d : docTypes.all()) {
            if (fieldsOf(d.code()).contains(fieldKey)) docs.add(d.code());
        }
        return docs;
    }

    /** Every field key the dictionary says is readable off one document. */
    private Set<String> fieldsOf(String docCode) {
        Set<String> keys = new LinkedHashSet<>();
        for (CheckCatalog.FieldBinding b : catalog.bindingsFor(docCode)) keys.add(b.key());
        return keys;
    }

    /**
     * What the planner is allowed to write, as a prompt fragment.
     *
     * <p>Document by document, because a field is not a field on its own — an invoice's
     * "total" and a draft's "amount" are different bindings, and a planner given one flat
     * list writes comparisons that read a field off a document nobody reads it from.
     *
     * <p>Attestations are left out: whether a page is signed or sealed is settled by looking
     * at it rather than by comparing characters, and a rule that tries to compare one would
     * validate here and return INCONCLUSIVE for ever. Those go through a requirement's
     * {@code attestations} instead.
     */
    public String vocabulary() {
        StringBuilder sb = new StringBuilder();
        for (CheckCatalog.DocTypeDef d : docTypes.all()) {
            List<CheckCatalog.FieldBinding> bindings = catalog.bindingsFor(d.code()).stream()
                    .filter(b -> !b.attestation())
                    .toList();
            if (bindings.isEmpty()) continue;
            sb.append("  ").append(d.code()).append(" (").append(d.name()).append(")\n");
            for (CheckCatalog.FieldBinding b : bindings) {
                sb.append("    ").append(b.key());
                if (b.name() != null && !b.name().isBlank()) sb.append(" — ").append(b.name());
                sb.append('\n');
            }
        }
        return sb.toString();
    }

    /**
     * The comparisons a rule may use. The judgement four are deliberately absent.
     *
     * <p>Generated from the enum rather than described again here. There used to be a
     * hand-written map of sixteen wire names to sixteen sentences sitting in this class, a
     * second list of the same names with different wording in the browser, and the enum —
     * three copies of one vocabulary, kept in step by hand.
     */
    public String operators() {
        StringBuilder sb = new StringBuilder();
        for (Operator o : Operator.authorable()) {
            if (!o.decidable()) continue;
            sb.append("    ").append(o.wire());
            if (o.describe() != null) sb.append(" — ").append(o.describe());
            if (o.usesTol()) sb.append(" (reads tol)");
            sb.append('\n');
        }
        return sb.toString();
    }

    /**
     * The values a condition may work out, rather than read.
     *
     * <p>Without these, UCP 600 art. 14(c) cannot be written down: there is no field called
     * "twenty-one days after the on-board date", so the demand went to a model and came back
     * as an opinion about arithmetic. There are eight of them and a planner may use those
     * eight, which is what keeps a compiled rule something the compiler can check.
     */
    public String functions() {
        StringBuilder sb = new StringBuilder();
        for (ConditionFn f : ConditionFn.all()) {
            sb.append("    ").append(f.wire())
              .append(f.arity() < 0 ? "(a, b, …)" : f.arity() == 1 ? "(a)" : "(a, b)")
              .append(" — ").append(f.describe()).append('\n');
        }
        return sb.toString();
    }
}
