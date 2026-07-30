package com.tb.helix.governance.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The rulebook's own persistence.
 *
 * <p>Reads are shaped for the authoring UI, which navigates constantly between checks,
 * dictionary and library — so {@link #bootstrap()} returns all of it at once rather than
 * making first paint eight round trips for a catalogue this size.
 */
@Component
public class GovernanceStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public GovernanceStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public Map<String, Object> bootstrap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("checks", plain(jdbc.queryForList("SELECT * FROM helix_gov.v_check_list ORDER BY id")));
        out.put("rules", plain(jdbc.queryForList("SELECT check_id, scope, message, groups::text FROM helix_gov.check_rule")));
        out.put("agents", plain(jdbc.queryForList("SELECT * FROM helix_gov.agent ORDER BY ordinal, id")));
        out.put("groups", plain(jdbc.queryForList("SELECT * FROM helix_gov.check_group ORDER BY agent_id, ordinal")));
        out.put("fields", plain(jdbc.queryForList("SELECT * FROM helix_gov.v_dict_field_usage ORDER BY key")));
        out.put("bindings", plain(jdbc.queryForList("SELECT * FROM helix_gov.field_binding ORDER BY field_key, ordinal")));
        out.put("docTypes", plain(jdbc.queryForList("SELECT * FROM helix_gov.v_doc_type_usage ORDER BY ordinal, code")));
        out.put("books", plain(jdbc.queryForList("SELECT * FROM helix_gov.book ORDER BY ordinal, id")));
        out.put("articles", plain(jdbc.queryForList("SELECT * FROM helix_gov.article ORDER BY book_id, ordinal")));
        out.put("comments", plain(jdbc.queryForList("SELECT * FROM helix_gov.comment ORDER BY created_at")));
        return out;
    }

    public int countChecks() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM helix_gov.check_def", Integer.class);
        return n == null ? 0 : n;
    }

    // --- Checks -------------------------------------------------------------

    public void saveCheck(Map<String, Object> c) {
        jdbc.update("""
                INSERT INTO helix_gov.check_def
                    (id, title, body, domain, severity, check_type, is_gate, cited_as,
                     agent_id, group_id, refs, field_refs, doc_types, suggestion, status, authored_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title, body = EXCLUDED.body, domain = EXCLUDED.domain,
                    severity = EXCLUDED.severity, check_type = EXCLUDED.check_type,
                    cited_as = EXCLUDED.cited_as, agent_id = EXCLUDED.agent_id,
                    group_id = EXCLUDED.group_id, refs = EXCLUDED.refs,
                    field_refs = EXCLUDED.field_refs, doc_types = EXCLUDED.doc_types,
                    suggestion = EXCLUDED.suggestion, status = EXCLUDED.status,
                    version = helix_gov.check_def.version + 1, updated_at = NOW()
                """,
                c.get("id"), c.get("title"), str(c.get("body")), c.get("domain"),
                c.getOrDefault("severity", "MAJOR"), c.getOrDefault("checkType", "AGENT"),
                Boolean.TRUE.equals(c.get("gate")), c.get("citedAs"),
                c.get("agentId"), c.get("groupId"),
                arr(c.get("refs")), arr(c.get("fields")), arr(c.get("docs")),
                c.get("suggestion"), c.getOrDefault("status", "DRAFT"), c.get("authoredBy"));
    }

    /**
     * Saves an exact check's conditions.
     *
     * <p>Also recomputes {@code operand_docs} on the check, in the same call. That column
     * is what makes gate eligibility a SQL predicate; leaving it to drift would mean a rule
     * whose operands moved onto a presented document kept claiming it can run first.
     */
    public void saveRule(String checkId, Map<String, Object> rule) {
        jdbc.update("""
                INSERT INTO helix_gov.check_rule (check_id, scope, message, groups)
                VALUES (?, ?, ?, ?::jsonb)
                ON CONFLICT (check_id) DO UPDATE SET
                    scope = EXCLUDED.scope, message = EXCLUDED.message,
                    groups = EXCLUDED.groups, updated_at = NOW()
                """, checkId, rule.get("scope"), rule.get("message"), toJson(rule.get("groups")));

        jdbc.update("""
                UPDATE helix_gov.check_def SET operand_docs = COALESCE((
                    SELECT array_agg(DISTINCT COALESCE(dt.code, t.d))
                      FROM helix_gov.check_rule r,
                           LATERAL jsonb_array_elements(r.groups) g,
                           LATERAL jsonb_array_elements(g->'rows') rw,
                           LATERAL (VALUES (rw->'l'->>'doc'), (rw->'r'->>'doc')) AS t(d)
                      -- The editor names documents by label; this column has to be codes,
                      -- or the gate predicate compares 'Letter of credit' with
                      -- LETTER_OF_CREDIT and every rule looks ineligible.
                      LEFT JOIN helix_gov.doc_type dt ON dt.name = t.d
                     WHERE r.check_id = ? AND t.d IS NOT NULL), '{}')
                 WHERE id = ?
                """, checkId, checkId);
    }

    public void setGate(String checkId, boolean on) {
        jdbc.update("UPDATE helix_gov.check_def SET is_gate = ?, updated_at = NOW() WHERE id = ?", on, checkId);
    }

    /** Whether this check could be a hard check, and why not when it cannot. */
    public Map<String, Object> gateEligibility(String checkId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT gate_eligible, gate_on, tier, has_conditions, operand_docs FROM helix_gov.v_check_list WHERE id = ?",
                checkId);
        if (rows.isEmpty()) return Map.of("eligible", false, "why", "No such check.");

        Map<String, Object> r = rows.get(0);
        boolean eligible = Boolean.TRUE.equals(r.get("gate_eligible"));
        String why;
        if (eligible) {
            why = "Every operand comes from the credit or the covering schedule, so this can run "
                    + "before anything is examined.";
        } else if (!"EXACT".equals(r.get("tier"))) {
            why = "Only an exact rule can run first — an agent cannot read documents before they are read.";
        } else if (!Boolean.TRUE.equals(r.get("has_conditions"))) {
            why = "Add a condition first — there is nothing to run.";
        } else {
            List<String> outside = jdbc.queryForList("""
                    SELECT DISTINCT d FROM helix_gov.check_def c, LATERAL unnest(c.operand_docs) d
                     WHERE c.id = ? AND d NOT IN (SELECT code FROM helix_gov.doc_type WHERE before_reading)
                    """, String.class, checkId);
            why = "Reads " + String.join(" and ", outside) + ", which "
                    + (outside.size() > 1 ? "are" : "is") + " not available until the presentation has been read.";
        }
        return Map.of("eligible", eligible, "on", Boolean.TRUE.equals(r.get("gate_on")), "why", why);
    }

    public void deleteCheck(String id) {
        jdbc.update("DELETE FROM helix_gov.check_def WHERE id = ?", id);
    }

    // --- Agents, dictionary, library ----------------------------------------

    public void saveAgent(Map<String, Object> a) {
        jdbc.update("""
                INSERT INTO helix_gov.agent (id, name, category, domain_id, eyebrow, summary,
                    description, behavior, owner, version, status, icon, accent, config, ordinal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, category = EXCLUDED.category, summary = EXCLUDED.summary,
                    description = EXCLUDED.description, behavior = EXCLUDED.behavior,
                    icon = EXCLUDED.icon, accent = EXCLUDED.accent, config = EXCLUDED.config,
                    updated_at = NOW()
                """,
                a.get("id"), a.get("name"), a.get("cat"), a.get("domainId"), a.get("eyebrow"),
                a.get("summary"), a.get("description"), a.get("behavior"), a.get("owner"),
                a.get("version"), a.getOrDefault("status", "DRAFT"), a.get("icon"),
                a.get("accent"), toJson(a.getOrDefault("config", Map.of())), a.getOrDefault("ordinal", 0));
    }

    public void saveGroup(Map<String, Object> g) {
        jdbc.update("""
                INSERT INTO helix_gov.check_group (id, agent_id, name, description, ordinal)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
                    description = EXCLUDED.description, ordinal = EXCLUDED.ordinal
                """, g.get("gid"), g.get("agentId"), g.get("name"), g.get("desc"), g.getOrDefault("ordinal", 0));
    }

    public void saveField(Map<String, Object> f) {
        jdbc.update("""
                INSERT INTO helix_gov.dict_field (key, name, description, kind, value_type, seeded)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name,
                    description = EXCLUDED.description, updated_at = NOW()
                """, f.getOrDefault("key", f.get("id")), f.get("name"), f.get("description"),
                f.getOrDefault("kind", "LC_FIELD"), f.get("valueType"),
                Boolean.TRUE.equals(f.get("seeded")));
    }

    public void saveBinding(String fieldKey, String docCode, String note, int ordinal) {
        jdbc.update("""
                INSERT INTO helix_gov.field_binding (field_key, doc_code, note, ordinal)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (field_key, doc_code) DO UPDATE SET note = EXCLUDED.note
                """, fieldKey, docCode, note, ordinal);
    }

    public void saveDocType(Map<String, Object> d) {
        jdbc.update("""
                INSERT INTO helix_gov.doc_type (code, name, description, before_reading, ordinal)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
                    description = EXCLUDED.description, before_reading = EXCLUDED.before_reading,
                    updated_at = NOW()
                """, d.getOrDefault("key", d.get("code")), d.get("name"), d.get("description"),
                Boolean.TRUE.equals(d.get("beforeReading")), d.getOrDefault("ordinal", 0));
    }

    public void saveBook(Map<String, Object> b) {
        jdbc.update("""
                INSERT INTO helix_gov.book (id, name, subtitle, kind, ordinal) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subtitle = EXCLUDED.subtitle
                """, b.get("id"), b.get("title"), b.get("subtitle"),
                b.getOrDefault("kind", "STANDARD"), b.getOrDefault("ordinal", 0));
    }

    public void saveArticle(Map<String, Object> a) {
        jdbc.update("""
                INSERT INTO helix_gov.article (id, book_id, code, section, heading, summary, body, ordinal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, section = EXCLUDED.section,
                    heading = EXCLUDED.heading, summary = EXCLUDED.summary, body = EXCLUDED.body,
                    updated_at = NOW()
                """, a.get("aid"), a.get("bookId"), a.get("code"), a.get("section"),
                a.get("title"), a.get("summary"), str(a.getOrDefault("read", "")), a.getOrDefault("ordinal", 0));
    }

    public void addComment(Map<String, Object> c) {
        jdbc.update("""
                INSERT INTO helix_gov.comment (target_kind, target_id, author, initials, body, tag)
                VALUES (?, ?, ?, ?, ?, ?)
                """, c.getOrDefault("targetKind", "CHECK"), c.get("targetId"),
                c.getOrDefault("author", "Officer"), c.get("initials"), c.get("text"), c.get("tag"));
    }

    public void delete(String table, String column, String value) {
        // Table and column are constants at every call site — never user input.
        jdbc.update("DELETE FROM helix_gov." + table + " WHERE " + column + " = ?", value);
    }

    // --- Helpers ------------------------------------------------------------

    /**
     * Makes JDBC rows serialisable.
     *
     * <p>A driver returns an array column as a live object holding its connection, and a
     * jsonb column as a driver-specific wrapper. Handing either to Jackson serialises the
     * connection — which is the error you get, and it names a replication protocol class,
     * so it tells you nothing about arrays.
     */
    private List<Map<String, Object>> plain(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            row.replaceAll((k, v) -> {
                if (v instanceof java.sql.Array a) {
                    try {
                        return List.of((Object[]) a.getArray());
                    } catch (Exception e) {
                        return List.of();
                    }
                }
                // PGobject by name rather than by type: the driver is runtimeOnly, which is
                // the correct scope, so its classes are not on the compile classpath.
                if (v != null && "org.postgresql.util.PGobject".equals(v.getClass().getName())) {
                    String raw = v.toString();
                    try {
                        return raw == null ? null : json.readValue(raw, Object.class);
                    } catch (Exception e) {
                        return raw;
                    }
                }
                return v;
            });
        }
        return rows;
    }

    private String toJson(Object o) {
        if (o == null) return null;
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String[] arr(Object o) {
        if (o instanceof List<?> l) return l.stream().map(String::valueOf).toArray(String[]::new);
        return new String[0];
    }
}
