package com.tb.helix.governance.persistence;

import com.tb.helix.governance.spi.CheckCatalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * The rulebook, served to lc-check.
 *
 * <p>In {@code persistence} because that is what it is — a query over governance's own
 * tables. It reads live {@code check_def} today; when the pin mode becomes RELEASE it reads
 * the frozen snapshot instead, so the rule that ran is the rule as it stood, and lc-check
 * does not change either way.
 *
 * <p>Reads live {@code check_def} today. When {@code helix.check.catalog.pin-mode} becomes
 * RELEASE this reads the pinned snapshot instead — the rule that ran is the rule as it
 * stood — and lc-check does not change.
 */
@Component
public class GovernanceCatalog implements CheckCatalog {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public GovernanceCatalog(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<CheckCard> activeChecks() {
        return jdbc.query("""
                SELECT c.*, r.groups::text AS rule_groups
                  FROM helix_gov.check_def c
                  LEFT JOIN helix_gov.check_rule r ON r.check_id = c.id
                 WHERE c.status <> 'RETIRED'
                 ORDER BY c.id
                """, this::card);
    }

    @Override
    public List<CheckCard> gates() {
        // The same eligibility the authoring view derives, so a gate that stopped
        // qualifying stops running rather than continuing to claim it runs first.
        return jdbc.query("""
                SELECT c.*, r.groups::text AS rule_groups
                  FROM helix_gov.check_def c
                  JOIN helix_gov.check_rule r ON r.check_id = c.id
                 WHERE c.is_gate
                   AND c.status <> 'RETIRED'
                   AND c.check_type = 'PROGRAMMATIC'
                   AND jsonb_array_length(COALESCE(r.groups, '[]'::jsonb)) > 0
                   AND c.operand_docs <@ (SELECT COALESCE(array_agg(code), '{}')
                                            FROM helix_gov.doc_type WHERE before_reading)
                 ORDER BY c.id
                """, this::card);
    }

    @Override
    public List<DocTypeDef> docTypes() {
        return jdbc.query("""
                SELECT code, name, description, role, before_reading
                  FROM helix_gov.doc_type
                 WHERE active
                 ORDER BY ordinal, code
                """, (rs, i) -> new DocTypeDef(
                        rs.getString("code"), rs.getString("name"), rs.getString("description"),
                        rs.getString("role"), rs.getBoolean("before_reading")));
    }

    @Override
    public List<FieldBinding> bindingsFor(String docCode) {
        return jdbc.query("""
                SELECT f.key, f.name, f.value_type, b.doc_code, b.note, b.aliases
                  FROM helix_gov.field_binding b
                  JOIN helix_gov.dict_field f ON f.key = b.field_key
                 WHERE b.doc_code = ?
                 ORDER BY b.ordinal, f.key
                """, (rs, i) -> new FieldBinding(
                        rs.getString("key"), rs.getString("name"), rs.getString("value_type"),
                        rs.getString("doc_code"), rs.getString("note"),
                        array(rs.getArray("aliases"))),
                docCode);
    }

    @Override
    public String articleText(String code) {
        return jdbc.queryForList("SELECT body FROM helix_gov.article WHERE code = ?", String.class, code)
                .stream().findFirst().orElse("");
    }

    private CheckCard card(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        String checkType = rs.getString("check_type");
        return new CheckCard(
                rs.getString("id"),
                rs.getString("title"),
                rs.getString("body"),
                rs.getString("domain"),
                rs.getString("severity"),
                checkType,
                "PROGRAMMATIC".equals(checkType) ? "EXACT" : "JUDGED",
                rs.getBoolean("is_gate"),
                rs.getString("cited_as"),
                array(rs.getArray("refs")),
                array(rs.getArray("field_refs")),
                array(rs.getArray("doc_types")),
                parse(rs.getString("rule_groups")));
    }

    private List<String> array(java.sql.Array a) {
        try {
            return a == null ? List.of() : List.of((String[]) a.getArray());
        } catch (Exception e) {
            return List.of();
        }
    }

    private Object parse(String raw) {
        if (raw == null) return null;
        try {
            return json.readValue(raw, Object.class);
        } catch (Exception e) {
            return null;
        }
    }
}
