package com.lc.v2.checker.domain.rule;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;

/**
 * Compound trigger DSL for rules. Polymorphic deserialisation via Jackson DEDUCTION
 * — variant chosen by the set of fields present in the YAML/JSON object.
 *
 * YAML examples:
 *   docs_present: [INV]
 *   lc_field_present: [beneficiary_name]
 *   lc_field_equals: { field: incoterms, values: [CIF, CIP] }
 *   lc_field_contains: { field: f43t_transhipment, needle: "PROHIBITED", case_insensitive: true }
 *   derived_equals: { key: incoterms_class, values: [CIF, CIP] }
 *   consistency_ok: { clause_id: f44C }
 *   not: { ... }
 *   any_of: [ {...}, {...} ]
 *   all_of: [ {...}, {...} ]
 */
public final class Triggers {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Container(@JsonProperty("root") TriggerNode root) {}

    @JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
    @JsonSubTypes({
            @JsonSubTypes.Type(DocsPresent.class),
            @JsonSubTypes.Type(LcFieldPresent.class),
            @JsonSubTypes.Type(LcFieldEquals.class),
            @JsonSubTypes.Type(LcFieldContains.class),
            @JsonSubTypes.Type(DerivedEquals.class),
            @JsonSubTypes.Type(ConsistencyOk.class),
            @JsonSubTypes.Type(Not.class),
            @JsonSubTypes.Type(AnyOf.class),
            @JsonSubTypes.Type(AllOf.class)
    })
    public sealed interface TriggerNode
            permits DocsPresent, LcFieldPresent, LcFieldEquals, LcFieldContains,
                    DerivedEquals, ConsistencyOk, Not, AnyOf, AllOf {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DocsPresent(@JsonProperty("docs_present") List<String> docs) implements TriggerNode {
        @JsonCreator public DocsPresent {
            docs = docs == null ? List.of() : List.copyOf(docs);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LcFieldPresent(@JsonProperty("lc_field_present") List<String> fields) implements TriggerNode {
        @JsonCreator public LcFieldPresent {
            fields = fields == null ? List.of() : List.copyOf(fields);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LcFieldEquals(
            @JsonProperty("lc_field_equals") Spec lc_field_equals) implements TriggerNode {
        @JsonCreator public LcFieldEquals { /* spec normalised below */ }
        public String field() { return lc_field_equals == null ? null : lc_field_equals.field(); }
        public List<String> values() { return lc_field_equals == null ? List.of() : lc_field_equals.values(); }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Spec(@JsonProperty("field") String field,
                           @JsonProperty("values") List<String> values) {
            @JsonCreator public Spec {
                values = values == null ? List.of() : List.copyOf(values);
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LcFieldContains(
            @JsonProperty("lc_field_contains") Spec lc_field_contains) implements TriggerNode {
        @JsonCreator public LcFieldContains {}
        public String field() { return lc_field_contains == null ? null : lc_field_contains.field(); }
        public String needle() { return lc_field_contains == null ? null : lc_field_contains.needle(); }
        public boolean caseInsensitiveOrDefault() {
            return lc_field_contains == null || lc_field_contains.caseInsensitiveOrDefault();
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Spec(@JsonProperty("field") String field,
                           @JsonProperty("needle") String needle,
                           @JsonProperty("case_insensitive") Boolean caseInsensitive) {
            @JsonCreator public Spec {}
            public boolean caseInsensitiveOrDefault() {
                return caseInsensitive == null || caseInsensitive;
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DerivedEquals(
            @JsonProperty("derived_equals") Spec derived_equals) implements TriggerNode {
        @JsonCreator public DerivedEquals {}
        public String key() { return derived_equals == null ? null : derived_equals.key(); }
        public List<String> values() { return derived_equals == null ? List.of() : derived_equals.values(); }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Spec(@JsonProperty("key") String key,
                           @JsonProperty("values") List<String> values) {
            @JsonCreator public Spec {
                values = values == null ? List.of() : List.copyOf(values);
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ConsistencyOk(
            @JsonProperty("consistency_ok") Spec consistency_ok) implements TriggerNode {
        @JsonCreator public ConsistencyOk {}
        public String clauseId() { return consistency_ok == null ? null : consistency_ok.clauseId(); }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Spec(@JsonProperty("clause_id") String clauseId) {
            @JsonCreator public Spec {}
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Not(@JsonProperty("not") TriggerNode child) implements TriggerNode {
        @JsonCreator public Not {}
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AnyOf(@JsonProperty("any_of") List<TriggerNode> children) implements TriggerNode {
        @JsonCreator public AnyOf {
            children = children == null ? List.of() : List.copyOf(children);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AllOf(@JsonProperty("all_of") List<TriggerNode> children) implements TriggerNode {
        @JsonCreator public AllOf {
            children = children == null ? List.of() : List.copyOf(children);
        }
    }

    private Triggers() {}
}
