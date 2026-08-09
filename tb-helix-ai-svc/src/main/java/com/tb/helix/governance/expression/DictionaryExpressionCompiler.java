package com.tb.helix.governance.expression;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.spi.ExpressionRules;
import com.tb.helix.governance.types.ExpressionRule;
import com.tb.helix.governance.types.RuleProblems;
import com.tb.helix.harness.expr.ExprProgram;
import com.tb.helix.harness.expr.ExpressionEngine;
import com.tb.helix.harness.expr.Values;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The half of checking an expression that needs to know what a document is.
 *
 * <p>The engine has already refused anything unsafe and anything ungrammatical. What is left
 * is the question it cannot ask: {@code {BOL.port_of_lading}} parses perfectly and is a typo.
 * Stored, it would compile, plan, run, and come back "could not be settled" on every
 * presentation for ever, looking exactly like a check that ran and found nothing.
 *
 * <p>That failure has a name here — {@code v_dangling_reference} reports it after the fact —
 * and this is the same knowledge beforehand, where it can still stop the check being written.
 *
 * <h2>The type pass is a courtesy, not a guard</h2>
 *
 * <p>Comparing a date with an amount is not dangerous: the engine answers "could not be
 * settled", which is true and sends it to a person. It is simply not what the author meant,
 * and finding out now is the difference between fixing it and shipping a check that can never
 * answer. So the type rules here are advisory in nature and refusing in effect — and they are
 * deliberately shallow: they read the <em>names</em> a leaf uses, because that is what the
 * engine reports, and do not attempt to type a literal or the return of a verb. A wrong
 * comparison that slips past is unanswerable rather than wrong, which is the safe direction.
 */
@Component
public class DictionaryExpressionCompiler implements ExpressionRules {

    /** What the dictionary calls a value, folded into what can be ordered against what. */
    private enum Kind {
        /** Dates. Ordered among themselves and nothing else. */
        DATE,
        /** Amounts, quantities, percentages. Ordered among themselves. */
        NUMBER,
        /** Words. No order at all, and equality that should fold rather than match exactly. */
        TEXT,
        /** Yes or no. A leaf on its own; neither ordered nor compared. */
        FLAG,
        /** The dictionary did not say, so nothing is asserted about it. */
        UNSAID
    }

    private final CheckCatalog catalog;
    private final ExpressionEngine engine;

    public DictionaryExpressionCompiler(CheckCatalog catalog, ExpressionEngine engine) {
        this.catalog = catalog;
        this.engine = engine;
    }

    @Override
    public Checked check(String source) {
        ExprProgram program = engine.compile(source);
        if (!program.ok()) return new Checked(program, program.problems(), List.of(), false);

        List<String> problems = new ArrayList<>();
        Map<String, Kind> kinds = new LinkedHashMap<>();

        for (String name : program.names()) {
            Kind kind = resolve(name, problems);
            if (kind != null) kinds.put(name, kind);
        }
        if (problems.isEmpty()) {
            for (ExprProgram.Leaf leaf : program.leaves()) typeLeaf(leaf, kinds, problems);
        }
        return new Checked(program, problems, reads(program), judged(program));
    }

    /**
     * {@inheritDoc}
     *
     * <p>The same {@link Kind} the type pass uses, so what an author is allowed to compare and
     * what the comparison is actually made of are one answer rather than two that agree today.
     */
    @Override
    public Object read(String name, String text) {
        if (text == null || text.isBlank()) return null;
        return switch (kindFor(name)) {
            case DATE -> Values.date(text);
            case NUMBER -> Values.number(text);
            // FLAG and UNSAID included. Text compares as text, which is the reading that
            // cannot be wrong about an order.
            default -> text;
        };
    }

    /** Like {@link #resolve} but silent — binding is not the place to complain about a name. */
    private Kind kindFor(String name) {
        int dot = name.indexOf('.');
        if (dot <= 0 || dot == name.length() - 1) return Kind.UNSAID;
        CheckCatalog.FieldBinding b = binding(name.substring(0, dot), name.substring(dot + 1));
        return b == null ? Kind.UNSAID : kindOf(b);
    }

    /** What it reads, split, for the facet SQL joins against. */
    private static List<Checked.Read> reads(ExprProgram program) {
        List<Checked.Read> out = new ArrayList<>();
        for (String name : program.names()) {
            int dot = name.indexOf('.');
            if (dot > 0 && dot < name.length() - 1) {
                out.add(new Checked.Read(name.substring(0, dot), name.substring(dot + 1)));
            }
        }
        return out;
    }

    /**
     * Whether any comparison it makes is a reading.
     *
     * <p>Asked of the verbs rather than of the author. {@code #sameParty} can prove that two
     * names ARE one party and can never prove that they are not, so a check using it is
     * judged however it was typed — the same narrowing the tree language applies to its four
     * judgement operators, and for the same reason.
     */
    private boolean judged(ExprProgram program) {
        Map<String, Boolean> byName = new LinkedHashMap<>();
        engine.verbs().forEach(v -> byName.put(v.name(), v.judgement()));
        return program.leaves().stream().anyMatch(l -> Boolean.TRUE.equals(byName.get(l.op())));
    }

    /**
     * One {@code {DOCUMENT.field}}, against the dictionary.
     *
     * @return what kind of value it is, or null when it is not a value at all — in which case
     *         the problem has already been recorded
     */
    private Kind resolve(String name, List<String> problems) {
        int dot = name.indexOf('.');
        if (dot <= 0 || dot == name.length() - 1 || name.indexOf('.', dot + 1) >= 0) {
            problems.add(RuleProblems.notADocumentAndField(name));
            return null;
        }
        String doc = name.substring(0, dot);
        String field = name.substring(dot + 1);

        // "every document that carries this field" — and at least one has to carry it, or
        // the condition reads it off none and is unanswerable by construction.
        if ("*".equals(doc)) {
            for (CheckCatalog.DocTypeDef d : catalog.docTypes()) {
                CheckCatalog.FieldBinding b = binding(d.code(), field);
                if (b != null) return kindOf(b);
            }
            problems.add(RuleProblems.notReadAnywhere(field));
            return null;
        }

        if (catalog.docTypes().stream().noneMatch(d -> d.code().equals(doc))) {
            problems.add(RuleProblems.notADocumentType(doc));
            return null;
        }
        CheckCatalog.FieldBinding b = binding(doc, field);
        if (b == null) {
            problems.add(RuleProblems.notReadFrom(field, doc));
            return null;
        }
        return kindOf(b);
    }

    /**
     * Attestations are excluded, and that is the same line {@code RuleCompiler} draws.
     *
     * <p>Whether a document is signed is read by a separate pass that looks at the page rather
     * than at its text, and it reaches an examination as a mark. A condition naming one would
     * be asking the fact table a question the fact table does not answer.
     */
    private CheckCatalog.FieldBinding binding(String doc, String field) {
        return catalog.bindingsFor(doc).stream()
                .filter(b -> !b.attestation())
                .filter(b -> b.key().equals(field))
                .findFirst().orElse(null);
    }

    private static Kind kindOf(CheckCatalog.FieldBinding b) {
        String type = b.valueType() == null ? "" : b.valueType().toUpperCase();
        return switch (type) {
            case "DATE" -> Kind.DATE;
            case "AMOUNT", "INTEGER", "NUMBER", "DECIMAL", "PERCENT" -> Kind.NUMBER;
            case "BOOLEAN" -> Kind.FLAG;
            case "STRING", "TEXT", "CURRENCY_CODE" -> Kind.TEXT;
            // The dictionary did not say. Asserting a kind we were not told is how a type
            // pass starts refusing conditions that are correct.
            default -> Kind.UNSAID;
        };
    }

    /** Whether the names in one comparison can be compared the way the author asked. */
    private static void typeLeaf(ExprProgram.Leaf leaf, Map<String, Kind> kinds, List<String> problems) {
        boolean ordering = List.of("<", "<=", ">", ">=").contains(leaf.op());
        boolean equality = List.of("==", "!=").contains(leaf.op());
        if (!ordering && !equality) return;    // a verb knows its own arguments

        Set<Kind> seen = new LinkedHashSet<>();
        for (String name : leaf.names()) {
            Kind k = kinds.get(name);
            if (k == null || k == Kind.UNSAID) continue;
            seen.add(k);

            if (k == Kind.TEXT) {
                problems.add(ordering ? RuleProblems.textHasNoOrder(name)
                                      : RuleProblems.textNeedsSame(name));
                return;
            }
            if (k == Kind.FLAG && ordering) {
                problems.add(RuleProblems.textHasNoOrder(name));
                return;
            }
        }
        // Two kinds in one comparison. Only reported where both were stated: a field the
        // dictionary says nothing about must not make a correct condition unwritable.
        if (seen.size() > 1) {
            List<String> named = leaf.names().stream()
                    .filter(n -> kinds.get(n) != null && kinds.get(n) != Kind.UNSAID)
                    .toList();
            problems.add(RuleProblems.notComparable(named.get(0), named.get(named.size() - 1)));
        }
    }

    // =========================================================================
    // What an author, and a model, may read
    // =========================================================================

    @Override
    public String vocabulary() {
        StringBuilder sb = new StringBuilder();
        for (CheckCatalog.DocTypeDef d : catalog.docTypes()) {
            List<CheckCatalog.FieldBinding> bindings = catalog.bindingsFor(d.code()).stream()
                    .filter(b -> !b.attestation())
                    .toList();
            if (bindings.isEmpty()) continue;
            sb.append("  ").append(d.code()).append(" (").append(d.name()).append(")\n");
            for (CheckCatalog.FieldBinding b : bindings) {
                sb.append("    {").append(d.code()).append('.').append(b.key()).append('}');
                if (b.valueType() != null && !"STRING".equalsIgnoreCase(b.valueType())) {
                    sb.append("  ").append(b.valueType().toLowerCase());
                }
                if (b.name() != null && !b.name().isBlank()) sb.append("  — ").append(b.name());
                sb.append('\n');
            }
        }
        return sb.toString();
    }

    /**
     * The table first, then the condition language inside it.
     *
     * <p>Two layers and one string, because an author reads them together and a model writing
     * a check is given exactly what the author sees. The table is governance's — the engine
     * has never heard of WHEN.
     */
    @Override
    public String grammar() {
        return ExpressionRule.SYNTAX + "\n" + engine.grammar();
    }
}
