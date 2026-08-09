package com.tb.helix.lccheck.service;

import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.Rows;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a document said, keyed the dictionary's way.
 *
 * <p>Every reading is folded onto a dictionary key where one exists, so a fact can be joined
 * to the rule that cites it. What will not fold is kept and marked rather than dropped: an
 * unauthored field is still evidence, and the mark is how anyone learns the dictionary is
 * missing something. Before folding existed, the key stored was whatever the model invented —
 * 105 of them across a handful of cases, against 22 dictionary fields, and the seven that
 * matched did so by coincidence of capitalisation.
 *
 * <p>Here rather than on a stage because two readings now produce facts. The field pass reads
 * characters; the attest pass reads the page — is it signed, is it an original, is the
 * correction initialled — and both land in {@code lc_fact} under dictionary keys, because
 * that is the one table an exact rule joins on. Two copies of the folding would be two
 * chances for them to diverge on what counts as a match.
 */
@Component
public class FactWriter {

    /**
     * The flag on a reading the extractor found but the dictionary never asked for.
     *
     * <p>A constant because three places now depend on the exact string — this writer, the
     * credit's own fact writer, and the examiner's fact sheet, which must mark such a reading
     * so a judge can tell an invented field from an authored one. Spelled out in three files,
     * it would drift and the marking would silently stop.
     */
    public static final String OFF_DICTIONARY = "Not in the dictionary";

    /**
     * The flag on a reading that arrived as a list or an object where one value was asked for.
     *
     * <p>The extraction prompt asks for a flat map, {@code ExtractionSpec} keeps one value per
     * key, and {@code lc_fact} is unique on {@code (case, document, label)} — so a bill of
     * lading with two loading ports has nowhere to put the second, and what is stored is the
     * JSON of both in one cell.
     *
     * <p>Comparing that is worse than not comparing it. {@code "SHANGHAI"} against
     * {@code '["SHANGHAI","NINGBO"]'} is not equal, so the rule reports a discrepancy that
     * does not exist and is indistinguishable from one that does. Flagged here, the evaluator
     * answers <b>could not be settled</b> instead, which is true and sends it to a person.
     *
     * <p>This is a floor, not the fix. Representing repetition properly needs the prompt to
     * ask for an array, {@code lc_fact} to carry an ordinal, and the condition language to
     * gain set semantics — see {@code docs/architecture/evidence-and-agents.md} §9.1.
     */
    public static final String MULTI_VALUED = "More than one value was read for this field";

    private final CaseStore cases;
    private final ExtractionSpec spec;
    private final ObjectMapper json;

    public FactWriter(CaseStore cases, ExtractionSpec spec, ObjectMapper json) {
        this.cases = cases;
        this.spec = spec;
        this.json = json;
    }

    /**
     * Writes one reading.
     *
     * @param page the page a value is attributed to. The first of the document's pages: a
     *             scan has no character coordinates, so the viewer turns to a page rather
     *             than highlighting a line.
     * @return how many keys the dictionary did not recognise. Worth surfacing on the step —
     *         it is the only signal that the dictionary is behind what the documents carry.
     */
    public int write(String caseId, String docCode, int page, Object value) {
        return write(caseId, docCode, page, value, false, Map.of());
    }

    /**
     * @param attestation whether this came from the attest pass, which may answer a key the
     *                    document has no binding to — the five presence questions are asked
     *                    of every attested document
     * @param flags       per-key note for a human, overriding the dictionary one. Carries a
     *                    contradiction between what the pass concluded and what it listed:
     *                    "reported unsigned, but a signature was found" is a thing an officer
     *                    must see, and neither side of it may be quietly preferred.
     */
    public int write(String caseId, String docCode, int page, Object value,
                     boolean attestation, Map<String, String> flags) {
        if (!(value instanceof Map<?, ?> map)) return 0;

        Map<String, Object> returned = new LinkedHashMap<>();
        map.forEach((k, v) -> returned.put(String.valueOf(k), v));

        var readings = attestation
                ? spec.readAttestation(docCode, returned)
                : spec.read(docCode, returned);

        int offSchema = 0;
        for (var reading : readings.values()) {
            Object v = reading.value();
            // A nested object is the model elaborating where a flat value was asked for.
            // Kept as JSON rather than dropped: an officer can still read it.
            boolean many = v instanceof Map || v instanceof List;
            String text = many ? toJson(v) : String.valueOf(v);
            if (text.isBlank()) continue;
            if (!reading.known()) offSchema++;

            cases.upsertFact(caseId, Rows.of(
                    "docId", docCode,
                    "label", reading.label(),
                    "fieldKey", reading.key(),
                    "value", text,
                    "valueNorm", text.strip().toUpperCase(),
                    "page", page,
                    "source", "p." + page,
                    // Said plainly on the fact itself. An officer sorting by it sees what the
                    // dictionary does not yet cover, which is the only way that list is ever
                    // going to get shorter. A contradiction wins over that note: it is the
                    // more urgent of the two, and a key that contradicts itself is in the
                    // dictionary by definition.
                    // A serialised value beats both notes, because it is the only one that
                    // changes an answer rather than describing it: a rule comparing
                    // "SHANGHAI" against '["SHANGHAI","NINGBO"]' does not find a difference
                    // in the goods, it finds a difference in our storage, and reports it as a
                    // discrepancy indistinguishable from a real one.
                    "flag", many ? MULTI_VALUED
                            : flags.getOrDefault(reading.key(),
                                    reading.known() ? null : OFF_DICTIONARY),
                    // Quiet default. Real uncertainty is LOW (or a future model
                    // grade); MED on every row was indistinguishable from silence.
                    "confidence", "HIGH"));
        }
        return offSchema;
    }

    private String toJson(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }
}
