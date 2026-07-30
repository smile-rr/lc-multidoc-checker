package com.tb.helix.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.lccheck.catalog.CatalogPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * The rulebook, served to lc-check.
 *
 * <p>Implements a port lc-check declared, over tables governance owns — so it belongs to
 * neither module and lives in {@code app}, the one layer allowed to know both. Putting it
 * on the governance side would have made governance depend on lc-check, which is exactly
 * the coupling the port exists to prevent, and the build says so.
 *
 * <p>Reads live {@code check_def} today. When {@code helix.check.catalog.pin-mode} becomes
 * RELEASE this reads the pinned snapshot instead — the rule that ran is the rule as it
 * stood — and lc-check does not change.
 */
@Component
public class GovernanceCatalogAdapter implements CatalogPort {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public GovernanceCatalogAdapter(JdbcTemplate jdbc, ObjectMapper json) {
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
