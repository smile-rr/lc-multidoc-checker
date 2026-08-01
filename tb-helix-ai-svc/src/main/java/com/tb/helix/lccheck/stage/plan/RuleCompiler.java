package com.tb.helix.lccheck.stage.plan;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.lccheck.rule.Operator;
import com.tb.helix.lccheck.service.DocumentTypes;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
 * the customs post. <b>A rule that does not validate does not become an exact check</b> — the
 * card is demoted to judged and the reason recorded, because the one outcome that must never
 * happen is an invented comparison reported to an officer as deterministic. Three ways a
 * compiled rule is rejected, and all three are things a model does:
 *
 * <ul>
 *   <li>an operator nobody implements, or one of the four that are judgements wearing an
 *       operator's clothes ({@code noconflict}, {@code same_party}, …). Authoring those is
 *       legitimate in the console, where falling through to a judge is the point; here it
 *       means the planner claimed determinism it has not got.
 *   <li>a document code outside the dictionary — the comparison would read a document that
 *       does not exist and return INCONCLUSIVE forever.
 *   <li>a field key nothing extracts. Same outcome, harder to spot, because the code is real.
 * </ul>
 *
 * <p>The vocabulary it validates against is also the vocabulary it hands the planner
 * ({@link #vocabulary()}), so the two cannot drift: a field added to the dictionary is
 * offerable and acceptable in the same breath.
 */
@Component
public class RuleCompiler {

    /** Why a compiled rule was not accepted, or empty when it was. */
    public record Verdict(Object groups, List<String> problems) {

        public boolean ok() {
            return groups != null && problems.isEmpty();
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
     * Validates a rule the planner wrote, returning the {@code groups} array to store.
     *
     * @param rule what came back — either the whole {@code {"groups": [...]}} object or the
     *             array itself, because a model asked for one reliably produces the other
     */
    @SuppressWarnings("unchecked")
    public Verdict compile(Object rule) {
        Object groups = rule instanceof Map<?, ?> m ? m.get("groups") : rule;
        if (!(groups instanceof List<?> list) || list.isEmpty()) {
            return new Verdict(null, List.of("no conditions"));
        }

        List<String> problems = new ArrayList<>();
        int rows = 0;
        for (Object g : list) {
            if (!(g instanceof Map<?, ?> raw)) {
                problems.add("a group that is not a group");
                continue;
            }
            Object rowList = ((Map<String, Object>) raw).get("rows");
            if (!(rowList instanceof List<?> rl) || rl.isEmpty()) {
                problems.add("a group with no rows");
                continue;
            }
            for (Object r : rl) {
                if (!(r instanceof Map<?, ?> row)) {
                    problems.add("a row that is not a row");
                    continue;
                }
                rows++;
                check((Map<String, Object>) row, problems);
            }
        }
        if (rows == 0) problems.add("no conditions");
        return new Verdict(problems.isEmpty() ? groups : null, List.copyOf(problems));
    }

    @SuppressWarnings("unchecked")
    private void check(Map<String, Object> row, List<String> problems) {
        Operator op = Operator.of(String.valueOf(row.get("op")));
        if (op == Operator.UNKNOWN) {
            problems.add("\"" + row.get("op") + "\" is not an operator this examination knows");
            return;
        }
        // The four judgement operators are honest in the console and dishonest here. An
        // author choosing `noconflict` is asking for a reading; a planner choosing it is
        // labelling a reading as a comparison.
        if (op.needsJudgement()) {
            problems.add("\"" + op.wire() + "\" is a reading rather than a comparison");
            return;
        }

        operand(row.get("l"), "left", problems);
        if (!op.unary()) {
            Object right = row.get("r");
            // A literal right-hand side is how a credit's own value gets into a comparison —
            // "shows LC-2024-0031". It names no document, so there is nothing to resolve.
            boolean literal = right instanceof Map<?, ?> m
                    && ((Map<String, Object>) m).get("literal") != null;
            if (!literal) operand(right, "right", problems);
        }
    }

    @SuppressWarnings("unchecked")
    private void operand(Object operand, String side, List<String> problems) {
        if (!(operand instanceof Map<?, ?> raw)) {
            problems.add("the " + side + " side is missing");
            return;
        }
        Map<String, Object> o = (Map<String, Object>) raw;
        String doc = str(o.get("doc"));
        String field = str(o.get("field"));
        if (doc == null || field == null) {
            problems.add("the " + side + " side names no document and field");
            return;
        }
        if (!docTypes.known(doc)) {
            problems.add(doc + " is not a document type in the dictionary");
            return;
        }
        if (!fieldsOf(doc).contains(field)) {
            problems.add(field + " is not read from " + doc);
        }
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

    /** The comparisons a rule may use. The judgement four are deliberately absent. */
    public String operators() {
        Map<String, String> described = new LinkedHashMap<>();
        described.put("eq", "text is the same");
        described.put("ne", "text differs");
        described.put("contains", "the left text contains the right");
        described.put("oneof", "the left value is one of a comma-separated right list");
        described.put("matches", "the left text matches the right regular expression");
        described.put("nmatches", "the left text does not match the right regular expression");
        described.put("n_eq", "amounts are equal");
        described.put("lte", "the left amount is at most the right");
        described.put("gte", "the left amount is at least the right");
        described.put("within_pct", "the left amount is within tol percent of the right");
        described.put("d_eq", "the dates are the same day");
        described.put("d_lte", "the left date is on or before the right");
        described.put("d_gte", "the left date is on or after the right");
        described.put("d_within", "the left date is within tol days of the right");
        described.put("present", "the left field is stated at all (no right side)");
        described.put("absent", "the left field is not stated (no right side)");

        StringBuilder sb = new StringBuilder();
        for (Operator o : Operator.values()) {
            if (!o.decidable()) continue;
            String note = described.get(o.wire());
            sb.append("    ").append(o.wire());
            if (note != null) sb.append(" — ").append(note);
            sb.append('\n');
        }
        return sb.toString();
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).strip();
        return s.isEmpty() ? null : s;
    }
}
