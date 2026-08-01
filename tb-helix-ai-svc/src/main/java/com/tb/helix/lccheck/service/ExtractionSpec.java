package com.tb.helix.lccheck.service;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.spi.CheckCatalog.FieldBinding;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * What to read off a document, and what to call it once read.
 *
 * <p>Both halves come from the dictionary's bindings, and that is the point. The predecessor
 * had a YAML file listing the fields per document type <em>and</em> a hand-written prompt
 * per document type naming the same fields — 145 lines of definition against 833 lines of
 * prompt restating it. They drifted, exactly as two copies of anything do: its packing-list
 * prompt asks for {@code packages_per_carton} and {@code consolidation_type}, and neither
 * field exists in the pool.
 *
 * <p>So the prompt is generated. Add a binding in the console and the next extraction asks
 * for it; there is no second place to remember.
 *
 * <h2>Open world, folded</h2>
 *
 * <p>The reading is still open — a document is asked for everything on it, not only what the
 * dictionary knows, because a field nobody has authored yet is still evidence and an
 * examiner may want it. What changes is what happens next: a returned key is folded onto the
 * dictionary key it belongs to via {@link #fold}, and only what will not fold survives as
 * itself, marked. That mark is the feedback loop — it is how anyone finds out the dictionary
 * is missing something, and it is what the predecessor had no way of producing.
 */
@Component
public class ExtractionSpec {

    private final CheckCatalog catalog;

    public ExtractionSpec(CheckCatalog catalog) {
        this.catalog = catalog;
    }

    public List<FieldBinding> forDoc(String docCode) {
        return catalog.bindingsFor(docCode);
    }

    /**
     * The bindings one reading can answer.
     *
     * <p>Two readings, because they are two different acts. Reading characters off a page
     * answers "what is the invoice total"; looking at the page answers "is it signed, and in
     * what capacity". Asking either pass for the other's fields gets a confident invention:
     * a transcriber asked whether a document is signed will say YES because it can see the
     * word "signature" printed above an empty line.
     */
    public List<FieldBinding> forDoc(String docCode, boolean attestation) {
        return forDoc(docCode).stream().filter(b -> b.attestation() == attestation).toList();
    }

    /**
     * The fields to ask for, as prompt lines.
     *
     * <p>Key, label, and the author's own note on how to read it here. The note is the whole
     * reason a binding is per-document: "Tag 31D — first six digits, YYMMDD" is useless
     * advice about an invoice.
     */
    public String fieldLines(String docCode) {
        return lines(forDoc(docCode, false));
    }

    /**
     * The five questions every attested document answers, whatever it is bound to.
     *
     * <p>Presence is the reason the pass exists. "Is there a signature, a seal, a correction;
     * is this an original; is it endorsed" is asked of any document worth looking at, and
     * leaving it to bindings meant an invoice's company chop came back as one line of prose
     * and no answer — because {@code seal_present} happened not to be bound to INV.
     *
     * <p>Binding a field is not the same as raising a discrepancy on it. UCP 600 art. 18(a)(iv)
     * says an invoice need not be signed; that is honoured by no rule testing
     * {@code INV.signed}, not by declining to read it. Reading is evidence; the rulebook
     * decides what is a discrepancy.
     */
    public static final List<String> PRESENCE = List.of(
            "signed", "seal_present", "corrections_present",
            "original_marking", "endorsement_present");

    /**
     * The attestations to ask for on this document beyond the fixed five.
     *
     * <p>Document-specific detail — a signature's capacity on a bill of lading, the freight
     * notation, how many originals were issued. Empty for most types, and that is the cost
     * control: a packing list with no attestation binding is never sent to the attest pass at
     * all, so a hundred-page bundle costs the three or four looks UCP requires, not twenty.
     */
    public String attestationLines(String docCode) {
        return lines(forDoc(docCode, true).stream()
                .filter(b -> !PRESENCE.contains(b.key()))
                .toList());
    }

    /** The fixed presence questions as prompt lines, labelled from the dictionary. */
    public String presenceLines() {
        Map<String, FieldBinding> byKey = new LinkedHashMap<>();
        for (FieldBinding b : catalog.fieldsOfKind(CheckCatalog.ATTESTATION)) {
            byKey.put(b.key(), b);
        }
        return lines(PRESENCE.stream().map(byKey::get).filter(java.util.Objects::nonNull).toList());
    }

    /**
     * Whether this document is worth looking at for marks.
     *
     * <p>The dictionary decides, not this class and not a list in Java. An author who needs
     * a signed packing list adds the binding in the console and the next reading looks for
     * it; nothing here changes.
     */
    public boolean attests(String docCode) {
        return !forDoc(docCode, true).isEmpty();
    }

    private static String lines(List<FieldBinding> bindings) {
        StringBuilder sb = new StringBuilder();
        for (FieldBinding b : bindings) {
            sb.append("  ").append(b.key()).append(" — ").append(b.name());
            if (b.valueType() != null && !"STRING".equals(b.valueType())) {
                sb.append(" (").append(b.valueType().toLowerCase()).append(')');
            }
            if (b.note() != null && !b.note().isBlank()) {
                sb.append(": ").append(b.note().strip().replaceAll("\\s+", " "));
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    /** Whether the dictionary has anything to say about this document at all. */
    public boolean knowsAnythingAbout(String docCode) {
        return !forDoc(docCode).isEmpty();
    }

    /**
     * The dictionary key a returned field belongs to, if any.
     *
     * <p>Three ways in, cheapest first: the key itself, an alias the author recorded for this
     * document, or the label with its punctuation flattened — which catches a model that
     * answered {@code "On-board date"} where {@code on_board_date} was asked for.
     *
     * <p>Scoped to the document. Folding globally is what forced the predecessor to make
     * aliases unique across every document type, and that constraint is not in the world:
     * "amount" means the draft's face value on a draft and the sum insured on an insurance
     * document, and both are correct.
     */
    public Optional<String> fold(String docCode, String returnedKey) {
        return fold(forDoc(docCode), returnedKey);
    }

    private Optional<String> fold(List<FieldBinding> candidates, String returnedKey) {
        if (returnedKey == null || returnedKey.isBlank()) return Optional.empty();
        String needle = normalise(returnedKey);

        for (FieldBinding b : candidates) {
            if (normalise(b.key()).equals(needle)) return Optional.of(b.key());
        }
        for (FieldBinding b : candidates) {
            for (String alias : b.aliases()) {
                if (normalise(alias).equals(needle)) return Optional.of(b.key());
            }
            if (normalise(b.name()).equals(needle)) return Optional.of(b.key());
        }
        return Optional.empty();
    }

    /** The label to show for a key on this document, falling back to the key humanised. */
    public String labelFor(String docCode, String key) {
        return labelFor(forDoc(docCode), key);
    }

    private String labelFor(List<FieldBinding> candidates, String key) {
        for (FieldBinding b : candidates) {
            if (b.key().equals(key)) return b.name();
        }
        return humanise(key);
    }

    /**
     * Reads a whole extraction, keyed the dictionary's way.
     *
     * <p>Order matters on a collision: a document that returns both {@code total} and
     * {@code invoice_value} folds both onto the same key, and the first one wins rather than
     * the last. First is the one the dictionary named, because the prompt asked for it by
     * key and the extras come after.
     *
     * @return key → reading, with {@link Reading#known} saying whether the dictionary
     *         recognised it
     */
    public Map<String, Reading> read(String docCode, Map<String, Object> returned) {
        return read(forDoc(docCode), returned);
    }

    /**
     * The same, for the attest pass, which may legitimately answer a key this document has
     * no binding to.
     *
     * <p>The five presence questions are asked of every attested document, so an invoice
     * answers {@code seal_present} without INV being bound to it. Folding against the
     * document's bindings alone would mark that "not in the dictionary" — which would be
     * false, and would put a key no rule can cite into the officer's face as a gap in the
     * dictionary. The dictionary has the field; this document merely has no note about it.
     */
    public Map<String, Reading> readAttestation(String docCode, Map<String, Object> returned) {
        List<FieldBinding> candidates = new ArrayList<>(forDoc(docCode));
        Set<String> have = candidates.stream().map(FieldBinding::key).collect(Collectors.toSet());
        for (FieldBinding global : catalog.fieldsOfKind(CheckCatalog.ATTESTATION)) {
            if (have.add(global.key())) candidates.add(global);
        }
        return read(candidates, returned);
    }

    private Map<String, Reading> read(List<FieldBinding> candidates, Map<String, Object> returned) {
        Map<String, Reading> out = new LinkedHashMap<>();
        returned.forEach((raw, value) -> {
            if (raw == null || raw.startsWith("_") || value == null) return;
            Optional<String> key = fold(candidates, raw);
            String resolved = key.orElse(normalise(raw));
            out.putIfAbsent(resolved, new Reading(
                    resolved,
                    key.map(k -> labelFor(candidates, k)).orElse(humanise(raw)),
                    value,
                    key.isPresent()));
        });
        return out;
    }

    /**
     * One field read off a document.
     *
     * @param known false when the dictionary has no binding for it. Kept, not dropped: an
     *              unauthored field is still something the document says, and throwing it
     *              away would hide both the evidence and the fact that the dictionary is
     *              incomplete.
     */
    public record Reading(String key, String label, Object value, boolean known) {
    }

    private static String normalise(String s) {
        return s.trim().toLowerCase().replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
    }

    private static String humanise(String key) {
        String s = key.replace('_', ' ').strip();
        return s.isEmpty() ? key : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
