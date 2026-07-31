package com.tb.helix.governance.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The catalogue, read and written whole.
 *
 * <p>Five kinds of thing — document types, dictionary fields, checks, agents, books — each
 * one row carrying one JSON document. There is no column list here, and that is the point:
 * the version this replaces enumerated columns in an INSERT, again in an ON CONFLICT, and a
 * third time in the parameter list, and the bugs were exactly what you would predict.
 * {@code saveField} named six columns and silently dropped every binding the author had
 * written; {@code saveDocType} named five and dropped {@code role}. Both looked like they
 * worked.
 *
 * <p>A document cannot lose a field it was given. What arrives is what is stored, and what
 * is stored is what comes back.
 *
 * <p>Governance is CRUD and nothing else — no approval, no attribution, no publish step.
 * Save writes.
 */
@Component
public class GovernanceStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public GovernanceStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    // --- Reading -------------------------------------------------------------

    /**
     * Everything the console renders from, in one request.
     *
     * <p>One request rather than eight: the sections are navigated between constantly, and
     * eight round trips on first paint to render a page that then needs none is the wrong
     * trade for a catalogue this size.
     *
     * <p>Each list is the documents themselves, in the shape the console already works in.
     * The mapping layer that used to sit between them — a hundred and sixty-nine lines of
     * row-to-object translation in the browser — had nothing left to do once both sides
     * spoke the same shape, and it was where a deleted lookup silently took the whole
     * console back onto its own fixture.
     */
    public Map<String, Object> bootstrap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("docTypes", docTypes());
        out.put("fields", fields());
        out.put("checks", checks());
        out.put("agents", documents("SELECT body FROM helix_gov.agent ORDER BY ordinal, id"));
        out.put("books", documents("SELECT body FROM helix_gov.book ORDER BY ordinal, id"));
        out.put("comments", jdbc.queryForList(
                "SELECT * FROM helix_gov.comment ORDER BY created_at"));
        // Reported, not enforced. The console owns referential integrity now; this is how
        // anyone sees where it slipped.
        out.put("dangling", jdbc.queryForList("SELECT * FROM helix_gov.v_dangling_reference"));
        return out;
    }

    /** Document types, each with the counts the console shows beside it. */
    public List<Map<String, Object>> docTypes() {
        return jdbc.query("""
                SELECT body, bound_fields, used_by_checks
                  FROM helix_gov.v_doc_type_usage
                 ORDER BY ordinal, code
                """, (rs, i) -> {
            Map<String, Object> d = document(rs.getString("body"));
            d.put("boundFields", rs.getInt("bound_fields"));
            d.put("usedByChecks", rs.getInt("used_by_checks"));
            return d;
        });
    }

    public List<Map<String, Object>> fields() {
        return jdbc.query("""
                SELECT body, used_by_checks
                  FROM helix_gov.v_dict_field_usage
                 ORDER BY key
                """, (rs, i) -> {
            Map<String, Object> f = document(rs.getString("body"));
            f.put("usedByChecks", rs.getInt("used_by_checks"));
            return f;
        });
    }

    /**
     * Checks, each with what the service worked out about it.
     *
     * <p>Gate eligibility is derived from the rule's own operands against the document
     * types available before a presentation is read. It is answered here rather than in the
     * browser because the dictionary is here, and a console guessing at it would be a
     * second implementation of the one rule that decides what may run first.
     */
    public List<Map<String, Object>> checks() {
        return jdbc.query("""
                SELECT body, tier, gate_eligible, gate_on, has_conditions, operand_docs, comment_count
                  FROM helix_gov.v_check_list
                 ORDER BY id
                """, (rs, i) -> {
            Map<String, Object> c = document(rs.getString("body"));
            c.put("tier", rs.getString("tier"));
            c.put("gateEligible", rs.getBoolean("gate_eligible"));
            c.put("gateOn", rs.getBoolean("gate_on"));
            c.put("hasConditions", rs.getBoolean("has_conditions"));
            c.put("operandDocs", array(rs.getArray("operand_docs")));
            c.put("commentCount", rs.getInt("comment_count"));
            return c;
        });
    }

    // --- Writing -------------------------------------------------------------
    //
    // One method per kind, one statement each, no column lists.

    public void saveDocType(Map<String, Object> body) {
        upsert("doc_type", "code", key(body, "key", "code"), body);
    }

    public void saveField(Map<String, Object> body) {
        upsert("dict_field", "key", key(body, "key", "id"), body);
    }

    public void saveCheck(Map<String, Object> body) {
        upsert("check_def", "id", key(body, "id"), body);
    }

    public void saveAgent(Map<String, Object> body) {
        upsert("agent", "id", key(body, "id"), body);
    }

    public void saveBook(Map<String, Object> body) {
        upsert("book", "id", key(body, "id"), body);
    }

    /**
     * Merges a change into a document that already exists.
     *
     * <p>The console mostly sends whole documents, but a few operations are genuinely
     * partial — a gate toggle, a rule saved on its own — and re-sending the entire check to
     * flip one boolean invites the browser's copy to overwrite something edited elsewhere.
     * Read, merge, write, in one statement.
     */
    private void merge(String table, String column, String id, Map<String, Object> patch) {
        jdbc.update("""
                UPDATE helix_gov.%s SET body = body || ?::jsonb, updated_at = NOW()
                 WHERE %s = ?
                """.formatted(table, column), toJson(patch), id);
    }

    /** The conditions of an exact check, saved into the check that owns them. */
    public void saveRule(String checkId, Map<String, Object> rule) {
        merge("check_def", "id", checkId, Map.of("rule", rule));
    }

    /** Whether this check is a hard check. Intent; eligibility is derived separately. */
    public void setGate(String checkId, boolean on) {
        merge("check_def", "id", checkId, Map.of("gate", on));
    }

    /**
     * Whether this check could run before the presentation is read, and why not.
     *
     * <p>Derived, never stored: exact, has conditions, and every document its operands read
     * is available before reading. A stored flag contradicting that derivation is a lie the
     * run would have to resolve, and it would resolve it by not running the gate at all.
     */
    public Map<String, Object> gateEligibility(String checkId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT gate_eligible, gate_on, has_conditions, check_type, operand_docs
                  FROM helix_gov.v_check_list WHERE id = ?
                """, checkId);
        if (rows.isEmpty()) return Map.of("eligible", false, "why", "No such check.");

        Map<String, Object> r = rows.get(0);
        boolean eligible = Boolean.TRUE.equals(r.get("gate_eligible"));
        return Map.of(
                "eligible", eligible,
                "on", Boolean.TRUE.equals(r.get("gate_on")),
                "why", eligible ? "Every document it reads is available before the presentation."
                        : why(r));
    }

    private String why(Map<String, Object> r) {
        if (!"PROGRAMMATIC".equals(r.get("check_type"))) {
            return "A judged check reads documents; it cannot run before they are read.";
        }
        if (!Boolean.TRUE.equals(r.get("has_conditions"))) {
            return "It has no conditions authored yet, so there is nothing to run.";
        }
        return "It reads a document that is not available until the presentation has been read.";
    }

    public void deleteCheck(String id) {
        delete("check_def", "id", id);
    }

    /**
     * A group, saved into the agent that owns it.
     *
     * <p>Groups were a table; a group belongs to exactly one agent and has never meant
     * anything apart from it, so it is an entry in the agent's document. Saving one is a
     * read-modify-write of that list — the only place in here that is not a single
     * statement, and it is that because a JSON array has no upsert.
     */
    @SuppressWarnings("unchecked")
    public void saveGroup(Map<String, Object> group) {
        String agentId = String.valueOf(group.get("agentId"));
        String gid = String.valueOf(group.get("gid"));

        List<Map<String, Object>> agents = jdbc.query(
                "SELECT body FROM helix_gov.agent WHERE id = ?",
                (rs, i) -> document(rs.getString("body")), agentId);
        if (agents.isEmpty()) return;

        Map<String, Object> agent = agents.get(0);
        List<Map<String, Object>> groups = agent.get("groups") instanceof List<?> l
                ? new java.util.ArrayList<>((List<Map<String, Object>>) l)
                : new java.util.ArrayList<>();

        groups.removeIf(g -> gid.equals(String.valueOf(g.get("gid"))));
        groups.add(new LinkedHashMap<>(group));
        agent.put("groups", groups);
        saveAgent(agent);
    }

    /** An article, saved into the book that holds it. */
    @SuppressWarnings("unchecked")
    public void saveArticle(Map<String, Object> article) {
        String bookId = String.valueOf(article.get("bookId"));
        String aid = String.valueOf(article.getOrDefault("aid", article.get("code")));

        List<Map<String, Object>> books = jdbc.query(
                "SELECT body FROM helix_gov.book WHERE id = ?",
                (rs, i) -> document(rs.getString("body")), bookId);
        if (books.isEmpty()) return;

        Map<String, Object> book = books.get(0);
        List<Map<String, Object>> articles = book.get("articles") instanceof List<?> l
                ? new java.util.ArrayList<>((List<Map<String, Object>>) l)
                : new java.util.ArrayList<>();

        articles.removeIf(a -> aid.equals(String.valueOf(a.getOrDefault("aid", a.get("code")))));
        articles.add(new LinkedHashMap<>(article));
        book.put("articles", articles);
        saveBook(book);
    }

    /** Removes an article from whichever book holds it. */
    public void deleteArticle(String aid) {
        jdbc.update("""
                UPDATE helix_gov.book
                   SET body = jsonb_set(body, '{articles}', COALESCE((
                           SELECT jsonb_agg(a) FROM jsonb_array_elements(body -> 'articles') a
                            WHERE COALESCE(a ->> 'aid', a ->> 'code') <> ?), '[]'::jsonb)),
                       updated_at = NOW()
                 WHERE body -> 'articles' @> jsonb_build_array(jsonb_build_object('aid', ?::text))
                    OR body -> 'articles' @> jsonb_build_array(jsonb_build_object('code', ?::text))
                """, aid, aid, aid);
    }

    public void delete(String table, String column, String id) {
        jdbc.update("DELETE FROM helix_gov." + table + " WHERE " + column + " = ?", id);
    }

    public void addComment(Map<String, Object> c) {
        jdbc.update("""
                INSERT INTO helix_gov.comment (target_kind, target_id, author, initials, body, tag)
                VALUES (?, ?, ?, ?, ?, ?)
                """, c.getOrDefault("targetKind", "CHECK"), c.get("targetId"),
                c.getOrDefault("author", "Officer"), c.get("initials"), c.get("body"), c.get("tag"));
    }

    /** Whether anything has been authored yet — the seeder's only question. */
    public boolean isEmpty() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM helix_gov.doc_type", Integer.class);
        return n == null || n == 0;
    }

    // --- Plumbing ------------------------------------------------------------

    /**
     * Writes a document under its key.
     *
     * <p>The table and column names come from the five call sites above and never from a
     * request, which is what makes the formatting safe. The document itself is a bound
     * parameter.
     */
    private void upsert(String table, String column, String id, Map<String, Object> body) {
        // The key belongs in the document too. A body that does not know its own key
        // survives a round trip through the browser and comes back unidentifiable.
        Map<String, Object> stored = new LinkedHashMap<>(body);
        stored.put("code".equals(column) ? "key" : column, id);

        jdbc.update("""
                INSERT INTO helix_gov.%s (%s, body) VALUES (?, ?::jsonb)
                ON CONFLICT (%s) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()
                """.formatted(table, column, column), id, toJson(stored));
    }

    private String key(Map<String, Object> body, String... candidates) {
        for (String c : candidates) {
            Object v = body.get(c);
            if (v != null && !String.valueOf(v).isBlank()) return String.valueOf(v);
        }
        throw new IllegalArgumentException("This has no key: " + candidates[0] + " is required");
    }

    private List<Map<String, Object>> documents(String sql) {
        return jdbc.query(sql, (rs, i) -> document(rs.getString("body")));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> document(String raw) {
        try {
            return json.readValue(raw, LinkedHashMap.class);
        } catch (Exception e) {
            throw new IllegalStateException("A stored document could not be read: " + e.getMessage(), e);
        }
    }

    private List<String> array(java.sql.Array a) {
        try {
            return a == null ? List.of() : List.of((String[]) a.getArray());
        } catch (Exception e) {
            return List.of();
        }
    }

    private String toJson(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException("This could not be stored as JSON: " + e.getMessage(), e);
        }
    }
}
